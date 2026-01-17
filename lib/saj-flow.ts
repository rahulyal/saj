/**
 * SAJ Flow Integration
 *
 * LLM-powered steps for generating and executing SAJ programs
 * using the flow framework pattern.
 */

import { z } from "zod";
import { SajProgram, SajProgramWithMeta } from "../schema.ts";
import {
  runProgram,
  createInMemoryHandlers,
  createDenoKvHandlers,
  type EffectHandlers,
  type KvEnv,
} from "../evaluator.ts";

// ///////////////////////////////////////////////////////////////////////////
// Types for flow integration
// ///////////////////////////////////////////////////////////////////////////

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

// ///////////////////////////////////////////////////////////////////////////
// SAJ Schema Documentation for LLM
// ///////////////////////////////////////////////////////////////////////////

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

// ///////////////////////////////////////////////////////////////////////////
// Generate SAJ Step
// ///////////////////////////////////////////////////////////////////////////

export type GenerateSajInput = {
  prompt: string;
  context?: string;
  model?: string;
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
});

const GenerateSajOutputSchema = z.object({
  description: z.string(),
  program: SajProgram,
  raw: z.unknown().optional(),
});

/**
 * Creates an LLM step that generates SAJ programs from natural language
 */
export function createGenerateSajStep(config: {
  apiKey: string;
  defaultModel?: string;
  maxAttempts?: number;
}): Step<GenerateSajInput, GenerateSajOutput> {
  const { apiKey, defaultModel = "gpt-4o", maxAttempts = 2 } = config;

  const step = async (
    input: GenerateSajInput,
    ctx?: StepContext
  ): Promise<GenerateSajOutput> => {
    const parsed = GenerateSajInputSchema.safeParse(input);
    if (!parsed.success) {
      const error = new Error(`Invalid input: ${parsed.error.message}`);
      ctx?.onError?.("generateSaj", error);
      throw error;
    }

    ctx?.onStart?.("generateSaj");
    const start = performance.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const model = input.model ?? defaultModel;
      ctx?.onAttempt?.("generateSaj", attempt, model);

      try {
        const systemPrompt = `You are a SAJ program generator. SAJ is a JSON-based programming language.

${SAJ_SCHEMA_DOCS}

${input.context ? `Additional context: ${input.context}` : ""}

Generate valid SAJ programs based on user requests. Always return a JSON object with:
- "description": A brief description of what the program does
- "program": The SAJ program (a valid SAJ expression or definition)

Be creative but ensure the program is syntactically valid.`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: input.prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
          throw new Error("No response from LLM");
        }

        const generated = JSON.parse(content);
        const validated = SajProgramWithMeta.safeParse(generated);

        if (!validated.success) {
          throw new Error(`Invalid SAJ program: ${validated.error.message}`);
        }

        const durationMs = Math.round(performance.now() - start);
        const result: GenerateSajOutput = {
          description: validated.data.description,
          program: validated.data.program,
        };

        const meta: RunMeta = {
          durationMs,
          model,
          attempt,
          tokens: data.usage
            ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
            : undefined,
        };

        console.log(`[generateSaj] ✓ ${durationMs}ms | ${model} | attempt ${attempt}`);
        ctx?.onComplete?.("generateSaj", result, meta);

        return result;
      } catch (e) {
        lastError = e as Error;
        console.error(`[generateSaj] ✗ attempt ${attempt}/${maxAttempts}: ${lastError.message}`);

        if (attempt === maxAttempts) break;
      }
    }

    ctx?.onError?.("generateSaj", lastError!);
    throw lastError;
  };

  return Object.assign(step, {
    meta: {
      name: "generateSaj",
      inputSchema: GenerateSajInputSchema,
      outputSchema: GenerateSajOutputSchema,
    },
  });
}

// ///////////////////////////////////////////////////////////////////////////
// Execute SAJ Step
// ///////////////////////////////////////////////////////////////////////////

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

/**
 * Creates a step that executes SAJ programs
 */
export function createExecuteSajStep(config?: {
  handlers?: EffectHandlers;
  kv?: Deno.Kv;
}): Step<ExecuteSajInput, ExecuteSajOutput> {
  const step = async (
    input: ExecuteSajInput,
    ctx?: StepContext
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
      const handlers = config?.handlers ?? (config?.kv
        ? createDenoKvHandlers(config.kv)
        : createInMemoryHandlers());

      const evalResult = await runProgram(parsed.data.program, {
        env: parsed.data.env ?? {},
        handlers,
      });

      const durationMs = Math.round(performance.now() - start);
      const result: ExecuteSajOutput = {
        result: evalResult.result,
        env: evalResult.env,
        logs: evalResult.logs,
      };

      const meta: RunMeta = { durationMs };

      console.log(`[executeSaj] ✓ ${durationMs}ms`);
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

// ///////////////////////////////////////////////////////////////////////////
// Combined Generate & Execute Flow
// ///////////////////////////////////////////////////////////////////////////

export type GenerateAndRunInput = {
  prompt: string;
  context?: string;
  env?: KvEnv;
};

export type GenerateAndRunOutput = {
  description: string;
  program: z.infer<typeof SajProgram>;
  result: unknown;
  env: KvEnv;
  logs: string[];
};

/**
 * Creates a combined flow that generates and executes SAJ programs
 */
export function createGenerateAndRunFlow(config: {
  apiKey: string;
  defaultModel?: string;
  handlers?: EffectHandlers;
  kv?: Deno.Kv;
}): Step<GenerateAndRunInput, GenerateAndRunOutput> {
  const generateStep = createGenerateSajStep({
    apiKey: config.apiKey,
    defaultModel: config.defaultModel,
  });

  const executeStep = createExecuteSajStep({
    handlers: config.handlers,
    kv: config.kv,
  });

  const step = async (
    input: GenerateAndRunInput,
    ctx?: StepContext
  ): Promise<GenerateAndRunOutput> => {
    // Step 1: Generate
    const generated = await generateStep(
      { prompt: input.prompt, context: input.context },
      ctx
    );

    // Step 2: Execute
    const executed = await executeStep(
      { program: generated.program, env: input.env },
      ctx
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

// ///////////////////////////////////////////////////////////////////////////
// Iterative Refinement Flow
// ///////////////////////////////////////////////////////////////////////////

export type IterativeFlowInput = {
  goal: string;
  maxIterations?: number;
  env?: KvEnv;
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

/**
 * Creates an iterative flow where the LLM can refine its approach based on results
 */
export function createIterativeFlow(config: {
  apiKey: string;
  defaultModel?: string;
  handlers?: EffectHandlers;
  kv?: Deno.Kv;
}): Step<IterativeFlowInput, IterativeFlowOutput> {
  const generateAndRun = createGenerateAndRunFlow(config);

  const step = async (
    input: IterativeFlowInput,
    ctx?: StepContext
  ): Promise<IterativeFlowOutput> => {
    const iterations: IterativeFlowOutput["iterations"] = [];
    let currentEnv = input.env ?? {};
    const maxIterations = input.maxIterations ?? 3;

    let currentPrompt = input.goal;

    for (let i = 0; i < maxIterations; i++) {
      const context = iterations.length > 0
        ? `Previous attempts:\n${iterations.map((iter, idx) =>
            `Attempt ${idx + 1}: ${JSON.stringify(iter.result)}`
          ).join("\n")}\n\nRefine your approach based on these results.`
        : undefined;

      try {
        const result = await generateAndRun(
          { prompt: currentPrompt, context, env: currentEnv },
          ctx
        );

        iterations.push({
          prompt: currentPrompt,
          program: result.program,
          result: result.result,
          logs: result.logs,
        });

        currentEnv = result.env;

        // Check if we should continue (simple heuristic: stop if result is truthy and no errors)
        if (result.result !== null && result.result !== undefined) {
          break;
        }
      } catch (error) {
        // On error, try to refine the prompt
        currentPrompt = `${input.goal}\n\nPrevious attempt failed with: ${(error as Error).message}\nPlease try a different approach.`;
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
      }),
      outputSchema: z.object({
        iterations: z.array(z.object({
          prompt: z.string(),
          program: SajProgram,
          result: z.unknown(),
          logs: z.array(z.string()),
        })),
        finalResult: z.unknown(),
        env: z.record(z.unknown()),
      }),
    },
  });
}
