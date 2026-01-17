/**
 * SAJ Flow Integration
 *
 * LLM-powered steps for generating and executing SAJ programs.
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { SajProgram, SajProgramWithMeta } from "../../core/schema.ts";
import {
  runProgram,
  createInMemoryHandlers,
  createDenoKvHandlers,
  type EffectHandlers,
  type KvEnv,
} from "../../core/evaluator.ts";
import {
  createLLMClient,
  fromEnv,
  isError,
  type LLMProvider,
  type LLMResponse,
  type LLMError,
} from "../../lib/llm.ts";

export type StepMeta = {
  name: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
};

export type RunMeta = {
  durationMs: number;
  model?: string;
  attempt?: number;
  tokens?: { input?: number; output?: number };
};

export type StepContext = {
  signal?: AbortSignal;
  onStart?: (stepName: string) => void;
  onComplete?: (stepName: string, output: unknown, meta: RunMeta) => void;
  onError?: (stepName: string, error: Error) => void;
  onAttempt?: (stepName: string, attempt: number, model: string) => void;
};

export type Step<TInput, TOutput> = {
  (input: TInput, ctx?: StepContext): Promise<TOutput>;
  meta: StepMeta;
};

const SAJ_SCHEMA_DOCS = `
SAJ (Scheme As JSON) is a JSON-based programming language. Programs are JSON objects with a "type" field.

## Primitive Types
- Number: { "type": "number", "value": 42 }
- String: { "type": "string", "value": "hello" }
- Boolean: { "type": "boolean", "value": true }

## Variable Reference
- { "type": "variable", "key": "x" }

## Arithmetic Operations
- { "type": "arithmeticOperation", "operation": "+", "operands": [...] }
- Operations: "+", "-", "*", "/"

## Comparative Operations
- { "type": "comparativeOperation", "operation": ">", "operands": [...] }
- Operations: ">", "<", "=", ">=", "<=", "!="

## Conditional
- { "type": "conditional", "condition": <expr>, "trueReturn": <expr>, "falseReturn": <expr> }

## Procedure (Lambda)
- { "type": "procedure", "inputs": ["x", "y"], "body": <expr> }

## Procedure Call
- { "type": "procedureCall", "procedure": <variable or procedure>, "arguments": [...] }

## Definition (top-level binding)
- { "type": "definition", "key": { "type": "variable", "key": "name" }, "value": <expr> }

## Effects (side effects)
- KV Get: { "type": "effect", "action": "kv:get", "key": "mykey" }
- KV Set: { "type": "effect", "action": "kv:set", "key": "mykey", "value": <expr> }
- KV Delete: { "type": "effect", "action": "kv:delete", "key": "mykey" }
- KV List: { "type": "effect", "action": "kv:list", "prefix": "optional" }
- Fetch: { "type": "effect", "action": "fetch", "url": "https://...", "method": "GET" }
- Log: { "type": "effect", "action": "log", "message": <expr> }
- Sequence: { "type": "effect", "action": "sequence", "steps": [<expr>, <expr>, ...] }
- Let (bind result): { "type": "effect", "action": "let", "binding": "varname", "value": <expr>, "body": <expr> }
`;

export type GenerateSajInput = {
  prompt: string;
  context?: string;
  model?: string;
  provider?: LLMProvider;
};

export type GenerateSajOutput = {
  description: string;
  program: z.infer<typeof SajProgram>;
  raw?: unknown;
};

const GenerateSajInputSchema = z.object({
  prompt: z.string(),
  context: z.string().optional(),
  model: z.string().optional(),
  provider: z.enum(["openai", "anthropic"]).optional(),
});

const GenerateSajOutputSchema = z.object({
  description: z.string(),
  program: SajProgram,
  raw: z.unknown().optional(),
});

export type GenerateSajConfig = {
  apiKey?: string;
  provider?: LLMProvider;
  defaultModel?: string;
  maxAttempts?: number;
};

export function createGenerateSajStep(
  config: GenerateSajConfig = {},
): Step<GenerateSajInput, GenerateSajOutput> {
  const { maxAttempts = 2 } = config;

  const step = async (
    input: GenerateSajInput,
    ctx?: StepContext,
  ): Promise<GenerateSajOutput> => {
    const parsed = GenerateSajInputSchema.safeParse(input);
    if (!parsed.success) {
      const error = new Error(`Invalid input: ${parsed.error.message}`);
      ctx?.onError?.("generateSaj", error);
      throw error;
    }

    ctx?.onStart?.("generateSaj");
    const start = performance.now();

    const provider = input.provider ?? config.provider;
    let client;

    if (config.apiKey && provider) {
      client = createLLMClient({
        provider,
        apiKey: config.apiKey,
        model: input.model ?? config.defaultModel,
      });
    } else {
      client = fromEnv(provider);
    }

    const systemPrompt = `You are a SAJ program generator. SAJ is a JSON-based programming language.

${SAJ_SCHEMA_DOCS}

${input.context ? `Additional context: ${input.context}` : ""}

Generate valid SAJ programs based on user requests.

IMPORTANT: Always respond with a JSON object containing exactly these two fields:
- "description": A brief description of what the program does
- "program": The SAJ program (a valid SAJ expression)`;

    ctx?.onAttempt?.(
      "generateSaj",
      1,
      input.model ?? config.defaultModel ?? "default",
    );

    const result = await client.generateWithRetry(
      {
        schema: SajProgramWithMeta,
        schemaName: "saj_program",
        schemaDescription: "A SAJ program with description",
        systemPrompt,
        userPrompt: input.prompt,
        temperature: 0.7,
      },
      maxAttempts,
    );

    if (isError(result)) {
      const error = new Error(result.message);
      ctx?.onError?.("generateSaj", error);
      throw error;
    }

    const durationMs = Math.round(performance.now() - start);
    const output: GenerateSajOutput = {
      description: result.data.description as string,
      program: result.data.program as z.infer<typeof SajProgram>,
    };

    const meta: RunMeta = {
      durationMs,
      model: result.model,
      tokens: result.usage
        ? { input: result.usage.inputTokens, output: result.usage.outputTokens }
        : undefined,
    };

    console.log(`[generateSaj] ${durationMs}ms | ${result.model}`);
    ctx?.onComplete?.("generateSaj", output, meta);

    return output;
  };

  return Object.assign(step, {
    meta: {
      name: "generateSaj",
      inputSchema: GenerateSajInputSchema,
      outputSchema: GenerateSajOutputSchema,
    },
  });
}

export type ExecuteSajInput = {
  program: z.infer<typeof SajProgram>;
  env?: KvEnv;
};

export type ExecuteSajOutput = {
  result: unknown;
  env: KvEnv;
  logs: string[];
};

const ExecuteSajInputSchema = z.object({
  program: SajProgram,
  env: z.record(z.unknown()).optional(),
});

const ExecuteSajOutputSchema = z.object({
  result: z.unknown(),
  env: z.record(z.unknown()),
  logs: z.array(z.string()),
});

export function createExecuteSajStep(config?: {
  handlers?: EffectHandlers;
  kv?: Deno.Kv;
}): Step<ExecuteSajInput, ExecuteSajOutput> {
  const step = async (
    input: ExecuteSajInput,
    ctx?: StepContext,
  ): Promise<ExecuteSajOutput> => {
    const parsed = ExecuteSajInputSchema.safeParse(input);
    if (!parsed.success) {
      const error = new Error(`Invalid input: ${parsed.error.message}`);
      ctx?.onError?.("executeSaj", error);
      throw error;
    }

    ctx?.onStart?.("executeSaj");
    const start = performance.now();

    try {
      const handlers =
        config?.handlers ??
        (config?.kv
          ? createDenoKvHandlers(config.kv)
          : createInMemoryHandlers());

      const evalResult = await runProgram(parsed.data.program, {
        env: (parsed.data.env ?? {}) as KvEnv,
        handlers,
      });

      const durationMs = Math.round(performance.now() - start);
      const result: ExecuteSajOutput = {
        result: evalResult.result,
        env: evalResult.env,
        logs: evalResult.logs,
      };

      const meta: RunMeta = { durationMs };

      console.log(`[executeSaj] ${durationMs}ms`);
      ctx?.onComplete?.("executeSaj", result, meta);

      return result;
    } catch (e) {
      const error = e as Error;
      ctx?.onError?.("executeSaj", error);
      throw error;
    }
  };

  return Object.assign(step, {
    meta: {
      name: "executeSaj",
      inputSchema: ExecuteSajInputSchema,
      outputSchema: ExecuteSajOutputSchema,
    },
  });
}

export type GenerateAndRunInput = {
  prompt: string;
  context?: string;
  env?: KvEnv;
  provider?: LLMProvider;
};

export type GenerateAndRunOutput = {
  description: string;
  program: z.infer<typeof SajProgram>;
  result: unknown;
  env: KvEnv;
  logs: string[];
};

export function createGenerateAndRunFlow(
  config: GenerateSajConfig & {
    handlers?: EffectHandlers;
    kv?: Deno.Kv;
  } = {},
): Step<GenerateAndRunInput, GenerateAndRunOutput> {
  const generateStep = createGenerateSajStep(config);

  const executeStep = createExecuteSajStep({
    handlers: config.handlers,
    kv: config.kv,
  });

  const step = async (
    input: GenerateAndRunInput,
    ctx?: StepContext,
  ): Promise<GenerateAndRunOutput> => {
    const generated = await generateStep(
      {
        prompt: input.prompt,
        context: input.context,
        provider: input.provider,
      },
      ctx,
    );

    const executed = await executeStep(
      { program: generated.program, env: input.env },
      ctx,
    );

    return {
      description: generated.description,
      program: generated.program,
      result: executed.result,
      env: executed.env,
      logs: executed.logs,
    };
  };

  return Object.assign(step, {
    meta: {
      name: "generateAndRunSaj",
      inputSchema: z.object({
        prompt: z.string(),
        context: z.string().optional(),
        env: z.record(z.unknown()).optional(),
        provider: z.enum(["openai", "anthropic"]).optional(),
      }),
      outputSchema: z.object({
        description: z.string(),
        program: SajProgram,
        result: z.unknown(),
        env: z.record(z.unknown()),
        logs: z.array(z.string()),
      }),
    },
  });
}

export type IterativeFlowInput = {
  goal: string;
  maxIterations?: number;
  env?: KvEnv;
  provider?: LLMProvider;
};

export type IterativeFlowOutput = {
  iterations: Array<{
    prompt: string;
    program: z.infer<typeof SajProgram>;
    result: unknown;
    logs: string[];
  }>;
  finalResult: unknown;
  env: KvEnv;
};

export function createIterativeFlow(
  config: GenerateSajConfig & {
    handlers?: EffectHandlers;
    kv?: Deno.Kv;
  } = {},
): Step<IterativeFlowInput, IterativeFlowOutput> {
  const generateAndRun = createGenerateAndRunFlow(config);

  const step = async (
    input: IterativeFlowInput,
    ctx?: StepContext,
  ): Promise<IterativeFlowOutput> => {
    const iterations: IterativeFlowOutput["iterations"] = [];
    let currentEnv = input.env ?? {};
    const maxIterations = input.maxIterations ?? 3;

    let currentPrompt = input.goal;

    for (let i = 0; i < maxIterations; i++) {
      const context =
        iterations.length > 0
          ? `Previous attempts:\n${iterations
              .map(
                (iter, idx) =>
                  `Attempt ${idx + 1}: ${JSON.stringify(iter.result)}`,
              )
              .join("\n")}\n\nRefine your approach based on these results.`
          : undefined;

      try {
        const result = await generateAndRun(
          {
            prompt: currentPrompt,
            context,
            env: currentEnv,
            provider: input.provider,
          },
          ctx,
        );

        iterations.push({
          prompt: currentPrompt,
          program: result.program,
          result: result.result,
          logs: result.logs,
        });

        currentEnv = result.env;

        if (result.result !== null && result.result !== undefined) {
          break;
        }
      } catch (error) {
        currentPrompt = `${input.goal}\n\nPrevious attempt failed with: ${
          (error as Error).message
        }\nPlease try a different approach.`;
      }
    }

    return {
      iterations,
      finalResult: iterations[iterations.length - 1]?.result,
      env: currentEnv,
    };
  };

  return Object.assign(step, {
    meta: {
      name: "iterativeSajFlow",
      inputSchema: z.object({
        goal: z.string(),
        maxIterations: z.number().optional(),
        env: z.record(z.unknown()).optional(),
        provider: z.enum(["openai", "anthropic"]).optional(),
      }),
      outputSchema: z.object({
        iterations: z.array(
          z.object({
            prompt: z.string(),
            program: SajProgram,
            result: z.unknown(),
            logs: z.array(z.string()),
          }),
        ),
        finalResult: z.unknown(),
        env: z.record(z.unknown()),
      }),
    },
  });
}

export { createLLMClient, fromEnv, isError } from "../../lib/llm.ts";
export type { LLMProvider, LLMResponse, LLMError } from "../../lib/llm.ts";
