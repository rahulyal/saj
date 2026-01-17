/**
 * Lightweight LLM Adapter for Structured Outputs
 *
 * Zod schema -> JSON Schema conversion with OpenAI and Anthropic API support.
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

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

export function zodToJsonSchema(
  schema: z.ZodType,
  visited: WeakSet<z.ZodType> = new WeakSet(),
): JSONSchema {
  if (visited.has(schema)) {
    return {};
  }
  visited.add(schema);

  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema._def.schema, visited);
  }

  if (schema instanceof z.ZodLazy) {
    const innerSchema = schema._def.getter();
    if (visited.has(innerSchema)) {
      return {};
    }
    return zodToJsonSchema(innerSchema, visited);
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType, visited);
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType, visited);
    return { anyOf: [inner, { type: "null" }] };
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType, visited);
    return { ...inner, default: schema._def.defaultValue() };
  }

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

  if (schema instanceof z.ZodLiteral) {
    const value = schema._def.value;
    return { const: value };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema._def.values };
  }

  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema._def.values);
    return { enum: values };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema._def.type, visited),
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType, visited);

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

  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: zodToJsonSchema(schema._def.valueType, visited),
    };
  }

  if (schema instanceof z.ZodUnion) {
    const options = schema._def.options as z.ZodType[];
    return {
      anyOf: options.map((opt) => zodToJsonSchema(opt, visited)),
    };
  }

  if (schema instanceof z.ZodDiscriminatedUnion) {
    const options = [...schema._def.options.values()] as z.ZodType[];
    return {
      anyOf: options.map((opt) => zodToJsonSchema(opt, visited)),
    };
  }

  if (schema instanceof z.ZodIntersection) {
    return {
      allOf: [
        zodToJsonSchema(schema._def.left, visited),
        zodToJsonSchema(schema._def.right, visited),
      ],
    };
  }

  if (schema instanceof z.ZodTuple) {
    const tupleItems = (schema._def.items as z.ZodType[]).map((item) =>
      zodToJsonSchema(item, visited),
    );
    return {
      type: "array",
      items: tupleItems.length === 1 ? tupleItems[0] : { anyOf: tupleItems },
    };
  }

  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return {};
  }

  return {};
}

const OPENAI_MODELS = {
  default: "gpt-5-nano",
  fast: "gpt-5-nano",
};

// Models that don't support custom temperature
const FIXED_TEMPERATURE_MODELS = ["gpt-5-nano", "o1", "o1-mini", "o1-preview"];

async function callOpenAI<T extends z.ZodType>(
  config: LLMConfig,
  options: StructuredOutputOptions<T>,
): Promise<LLMResponse<z.infer<T>> | LLMError> {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const model = config.model ?? OPENAI_MODELS.default;
  const useStrictMode = options.strict ?? false;

  const messages = [];

  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  let userContent = options.userPrompt;
  if (!useStrictMode) {
    userContent = `${options.userPrompt}\n\nRespond with valid JSON only.`;
  }

  messages.push({ role: "user", content: userContent });

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
    response_format = { type: "json_object" };
  }

  // Some models don't support custom temperature
  const supportsTemperature = !FIXED_TEMPERATURE_MODELS.some((m) =>
    model.startsWith(m),
  );

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens,
    response_format,
  };

  if (supportsTemperature && options.temperature !== undefined) {
    requestBody.temperature = options.temperature;
  }

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

export function createLLMClient(config: LLMConfig) {
  return {
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

export function isError<T>(
  result: LLMResponse<T> | LLMError,
): result is LLMError {
  return "type" in result && "message" in result && !("data" in result);
}

export function openai(apiKey: string, model?: string) {
  return createLLMClient({
    provider: "openai",
    apiKey,
    model,
  });
}

export function anthropic(apiKey: string, model?: string) {
  return createLLMClient({
    provider: "anthropic",
    apiKey,
    model,
  });
}

export function fromEnv(preferredProvider?: LLMProvider) {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (preferredProvider === "anthropic" && anthropicKey) {
    return anthropic(anthropicKey);
  }

  if (preferredProvider === "openai" && openaiKey) {
    return openai(openaiKey);
  }

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
