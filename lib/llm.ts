/**
 * Lightweight LLM Adapter for Structured Outputs
 *
 * A simple, Deno Deploy-native adapter for getting structured JSON outputs
 * from OpenAI and Anthropic APIs. No external dependencies beyond Zod.
 *
 * Features:
 * - Zod schema → JSON Schema conversion
 * - OpenAI Structured Outputs (json_schema response format)
 * - Anthropic Structured Outputs (tool_use pattern)
 * - Automatic validation and typed responses
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// ///////////////////////////////////////////////////////////////////////////
// Types
// ///////////////////////////////////////////////////////////////////////////

export type LLMProvider = "openai" | "anthropic";

export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

export type StructuredOutputOptions<T extends z.ZodType> = {
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Use strict JSON schema mode (OpenAI only). Set to false for complex recursive schemas. */
  strict?: boolean;
};

export type LLMResponse<T> = {
  data: T;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  raw?: unknown;
};

export type LLMError = {
  type: "api_error" | "validation_error" | "parse_error";
  message: string;
  status?: number;
  raw?: unknown;
};

// ///////////////////////////////////////////////////////////////////////////
// Zod to JSON Schema Converter
// ///////////////////////////////////////////////////////////////////////////

type JSONSchema = {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JSONSchema;
};

/**
 * Converts a Zod schema to JSON Schema
 * Handles common Zod types used in SAJ
 * Uses a WeakSet to track visited schemas and prevent infinite recursion
 */
export function zodToJsonSchema(
  schema: z.ZodType,
  visited: WeakSet<z.ZodType> = new WeakSet(),
): JSONSchema {
  // Check for circular reference
  if (visited.has(schema)) {
    // Return a permissive schema for circular references
    return {};
  }
  visited.add(schema);

  // Handle ZodEffects (refinements, transforms, etc.)
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema._def.schema, visited);
  }

  // Handle ZodLazy - evaluate once and cache
  if (schema instanceof z.ZodLazy) {
    const innerSchema = schema._def.getter();
    // For lazy schemas, we need to be careful about recursion
    // If we've seen this exact lazy schema, return permissive
    if (visited.has(innerSchema)) {
      return {};
    }
    return zodToJsonSchema(innerSchema, visited);
  }

  // Handle ZodOptional
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType, visited);
  }

  // Handle ZodNullable
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType, visited);
    return { anyOf: [inner, { type: "null" }] };
  }

  // Handle ZodDefault
  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType, visited);
    return { ...inner, default: schema._def.defaultValue() };
  }

  // Primitives
  if (schema instanceof z.ZodString) {
    const result: JSONSchema = { type: "string" };
    if (schema._def.checks) {
      for (const check of schema._def.checks) {
        if (check.kind === "min") result.minLength = check.value;
        if (check.kind === "max") result.maxLength = check.value;
        if (check.kind === "regex") result.pattern = check.regex.source;
        if (check.kind === "url") result.pattern = "^https?://";
      }
    }
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: JSONSchema = { type: "number" };
    if (schema._def.checks) {
      for (const check of schema._def.checks) {
        if (check.kind === "min") result.minimum = check.value;
        if (check.kind === "max") result.maximum = check.value;
        if (check.kind === "int") result.type = "integer";
      }
    }
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodNull) {
    return { type: "null" };
  }

  if (schema instanceof z.ZodUndefined) {
    return {};
  }

  // Literal
  if (schema instanceof z.ZodLiteral) {
    const value = schema._def.value;
    return { const: value };
  }

  // Enum
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema._def.values };
  }

  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema._def.values);
    return { enum: values };
  }

  // Arrays
  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema._def.type, visited),
    };
  }

  // Objects
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType, visited);

      // Check if field is required (not optional)
      if (
        !(value instanceof z.ZodOptional) &&
        !(value instanceof z.ZodDefault)
      ) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    };
  }

  // Records
  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: zodToJsonSchema(schema._def.valueType, visited),
    };
  }

  // Union
  if (schema instanceof z.ZodUnion) {
    const options = schema._def.options as z.ZodType[];
    return {
      anyOf: options.map((opt) => zodToJsonSchema(opt, visited)),
    };
  }

  // Discriminated Union
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const options = [...schema._def.options.values()] as z.ZodType[];
    return {
      anyOf: options.map((opt) => zodToJsonSchema(opt, visited)),
    };
  }

  // Intersection
  if (schema instanceof z.ZodIntersection) {
    return {
      allOf: [
        zodToJsonSchema(schema._def.left, visited),
        zodToJsonSchema(schema._def.right, visited),
      ],
    };
  }

  // Tuple - convert to array with items as a schema that allows any of the tuple types
  if (schema instanceof z.ZodTuple) {
    const tupleItems = (schema._def.items as z.ZodType[]).map((item) =>
      zodToJsonSchema(item, visited),
    );
    // For JSON Schema, we use prefixItems for tuples (JSON Schema draft 2020-12)
    // But for compatibility, we'll use anyOf for items
    return {
      type: "array",
      items: tupleItems.length === 1 ? tupleItems[0] : { anyOf: tupleItems },
    };
  }

  // Unknown / Any - allow anything
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return {};
  }

  // Fallback
  return {};
}

// ///////////////////////////////////////////////////////////////////////////
// OpenAI Adapter
// ///////////////////////////////////////////////////////////////////////////

const OPENAI_MODELS = {
  default: "gpt-4o",
  fast: "gpt-4o-mini",
};

async function callOpenAI<T extends z.ZodType>(
  config: LLMConfig,
  options: StructuredOutputOptions<T>,
): Promise<LLMResponse<z.infer<T>> | LLMError> {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const model = config.model ?? OPENAI_MODELS.default;

  // Determine if we should use strict JSON schema mode or simple json_object mode
  // Strict mode doesn't work well with complex recursive schemas
  const useStrictMode = options.strict ?? false;

  const messages = [];

  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  // For json_object mode, we need to mention JSON in the prompt
  let userContent = options.userPrompt;
  if (!useStrictMode) {
    userContent = `${options.userPrompt}\n\nRespond with valid JSON only.`;
  }

  messages.push({ role: "user", content: userContent });

  // Build response_format based on mode
  let response_format: Record<string, unknown>;
  if (useStrictMode) {
    const jsonSchema = zodToJsonSchema(options.schema);
    const schemaName = options.schemaName ?? "response";
    response_format = {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        description: options.schemaDescription,
        schema: jsonSchema,
        strict: true,
      },
    };
  } else {
    // Use simple json_object mode - more flexible, works with recursive schemas
    response_format = { type: "json_object" };
  }

  const requestBody = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    response_format,
  };

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        type: "api_error",
        message: `OpenAI API error: ${response.status}`,
        status: response.status,
        raw: error,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        type: "api_error",
        message: "No content in OpenAI response",
        raw: data,
      };
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        type: "parse_error",
        message: "Failed to parse JSON from OpenAI response",
        raw: content,
      };
    }

    // Validate with Zod
    const validated = options.schema.safeParse(parsed);
    if (!validated.success) {
      return {
        type: "validation_error",
        message: `Schema validation failed: ${validated.error.message}`,
        raw: parsed,
      };
    }

    return {
      data: validated.data,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
      model,
      raw: data,
    };
  } catch (error) {
    return {
      type: "api_error",
      message: `Request failed: ${(error as Error).message}`,
    };
  }
}

// ///////////////////////////////////////////////////////////////////////////
// Anthropic Adapter
// ///////////////////////////////////////////////////////////////////////////

const ANTHROPIC_MODELS = {
  default: "claude-sonnet-4-20250514",
  fast: "claude-haiku-4-20250514",
  opus: "claude-opus-4-20250514",
};

async function callAnthropic<T extends z.ZodType>(
  config: LLMConfig,
  options: StructuredOutputOptions<T>,
): Promise<LLMResponse<z.infer<T>> | LLMError> {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
  const model = config.model ?? ANTHROPIC_MODELS.default;

  const jsonSchema = zodToJsonSchema(options.schema);
  const schemaName = options.schemaName ?? "structured_response";

  // Anthropic uses tool_use for structured outputs
  const tool = {
    name: schemaName,
    description:
      options.schemaDescription ??
      "Generate a structured response matching the schema",
    input_schema: jsonSchema,
  };

  const messages = [{ role: "user", content: options.userPrompt }];

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 4096,
    messages,
    tools: [tool],
    tool_choice: { type: "tool", name: schemaName },
  };

  if (options.systemPrompt) {
    requestBody.system = options.systemPrompt;
  }

  if (options.temperature !== undefined) {
    requestBody.temperature = options.temperature;
  }

  try {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        type: "api_error",
        message: `Anthropic API error: ${response.status}`,
        status: response.status,
        raw: error,
      };
    }

    const data = await response.json();

    // Find tool_use content block
    const toolUse = data.content?.find(
      (block: { type: string }) => block.type === "tool_use",
    );

    if (!toolUse) {
      return {
        type: "api_error",
        message: "No tool_use in Anthropic response",
        raw: data,
      };
    }

    const parsed = toolUse.input;

    // Validate with Zod
    const validated = options.schema.safeParse(parsed);
    if (!validated.success) {
      return {
        type: "validation_error",
        message: `Schema validation failed: ${validated.error.message}`,
        raw: parsed,
      };
    }

    return {
      data: validated.data,
      usage: data.usage
        ? {
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
          }
        : undefined,
      model,
      raw: data,
    };
  } catch (error) {
    return {
      type: "api_error",
      message: `Request failed: ${(error as Error).message}`,
    };
  }
}

// ///////////////////////////////////////////////////////////////////////////
// Main API
// ///////////////////////////////////////////////////////////////////////////

/**
 * Create an LLM client for structured outputs
 */
export function createLLMClient(config: LLMConfig) {
  return {
    /**
     * Generate structured output matching the provided Zod schema
     */
    async generate<T extends z.ZodType>(
      options: StructuredOutputOptions<T>,
    ): Promise<LLMResponse<z.infer<T>> | LLMError> {
      switch (config.provider) {
        case "openai":
          return callOpenAI(config, options);
        case "anthropic":
          return callAnthropic(config, options);
        default:
          return {
            type: "api_error",
            message: `Unknown provider: ${config.provider}`,
          };
      }
    },

    /**
     * Generate with automatic retry on validation errors
     */
    async generateWithRetry<T extends z.ZodType>(
      options: StructuredOutputOptions<T>,
      maxAttempts = 2,
    ): Promise<LLMResponse<z.infer<T>> | LLMError> {
      let lastError: LLMError | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await this.generate(options);

        if (!isError(result)) {
          return result;
        }

        lastError = result;

        // Only retry on validation errors
        if (result.type !== "validation_error") {
          return result;
        }

        console.warn(
          `[LLM] Attempt ${attempt}/${maxAttempts} failed: ${result.message}`,
        );
      }

      return lastError!;
    },
  };
}

/**
 * Type guard to check if result is an error
 */
export function isError<T>(
  result: LLMResponse<T> | LLMError,
): result is LLMError {
  return "type" in result && "message" in result && !("data" in result);
}

/**
 * Helper to create OpenAI client
 */
export function openai(apiKey: string, model?: string) {
  return createLLMClient({
    provider: "openai",
    apiKey,
    model,
  });
}

/**
 * Helper to create Anthropic client
 */
export function anthropic(apiKey: string, model?: string) {
  return createLLMClient({
    provider: "anthropic",
    apiKey,
    model,
  });
}

// ///////////////////////////////////////////////////////////////////////////
// Convenience: Auto-detect provider from environment
// ///////////////////////////////////////////////////////////////////////////

/**
 * Create an LLM client from environment variables
 * Checks ANTHROPIC_API_KEY first, then OPENAI_API_KEY
 */
export function fromEnv(preferredProvider?: LLMProvider) {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (preferredProvider === "anthropic" && anthropicKey) {
    return anthropic(anthropicKey);
  }

  if (preferredProvider === "openai" && openaiKey) {
    return openai(openaiKey);
  }

  // Auto-detect
  if (anthropicKey) {
    return anthropic(anthropicKey);
  }

  if (openaiKey) {
    return openai(openaiKey);
  }

  throw new Error(
    "No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.",
  );
}
