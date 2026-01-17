/**
 * Self-Extending SAJ Agent
 *
 * An agent that searches for relevant macros, generates SAJ programs,
 * and creates new macros when capabilities are missing.
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { SajProgram, SajProcedure } from "../schema.ts";
import {
  runProgram,
  createInMemoryHandlers,
  createDenoKvHandlers,
  type EffectHandlers,
  type KvEnv,
} from "../evaluator.ts";
import { fromEnv, isError, type LLMProvider } from "./llm.ts";
import {
  type MacroRegistry,
  type Macro,
  InMemoryMacroRegistry,
  DenoKvMacroRegistry,
  initializeRegistry,
  formatMacrosForPrompt,
} from "./macros.ts";

export type AgentConfig = {
  registry?: MacroRegistry;
  handlers?: EffectHandlers;
  kv?: Deno.Kv;
  provider?: LLMProvider;
  maxMacroSearchResults?: number;
  enableMacroCreation?: boolean;
  verbose?: boolean;
};

export type AgentTask = {
  goal: string;
  context?: string;
  env?: KvEnv;
  provider?: LLMProvider;
};

export type AgentResult = {
  success: boolean;
  result: unknown;
  program: z.infer<typeof SajProgram>;
  macrosUsed: string[];
  macrosCreated: string[];
  logs: string[];
  env: KvEnv;
  reasoning?: string;
};

const MacroDecisionSchema = z.object({
  needsNewMacro: z.boolean(),
  reason: z.string(),
  macroSpec: z
    .object({
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      inputs: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          description: z.string(),
        })
      ),
      outputType: z.string(),
      outputDescription: z.string(),
    })
    .optional(),
});

const MacroImplementationSchema = z.object({
  procedure: SajProcedure,
  example: z.object({
    description: z.string(),
    arguments: z.array(z.any()),
    expectedResult: z.any(),
  }),
});

const ProgramWithMacrosSchema = z.object({
  description: z.string(),
  reasoning: z.string(),
  macrosUsed: z.array(z.string()),
  program: SajProgram,
});

export class SajAgent {
  private registry: MacroRegistry;
  private handlers: EffectHandlers;
  private config: AgentConfig;
  private initialized = false;

  constructor(config: AgentConfig = {}) {
    this.config = {
      maxMacroSearchResults: 5,
      enableMacroCreation: true,
      verbose: false,
      ...config,
    };

    if (config.registry) {
      this.registry = config.registry;
    } else if (config.kv) {
      this.registry = new DenoKvMacroRegistry(config.kv);
    } else {
      this.registry = new InMemoryMacroRegistry();
    }

    if (config.handlers) {
      this.handlers = config.handlers;
    } else if (config.kv) {
      this.handlers = createDenoKvHandlers(config.kv);
    } else {
      this.handlers = createInMemoryHandlers();
    }
  }

  private log(...args: unknown[]) {
    if (this.config.verbose) {
      console.log("[Agent]", ...args);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await initializeRegistry(this.registry);
    this.initialized = true;
    this.log("Initialized with builtin macros");
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    await this.initialize();

    const macrosUsed: string[] = [];
    const macrosCreated: string[] = [];
    const logs: string[] = [];

    const provider = task.provider ?? this.config.provider;
    const client = fromEnv(provider);

    this.log("Searching for relevant macros...");
    const relevantMacros = await this.registry.search(
      task.goal,
      this.config.maxMacroSearchResults
    );
    this.log(`Found ${relevantMacros.length} relevant macros`);

    if (this.config.enableMacroCreation && relevantMacros.length < 3) {
      this.log("Checking if new macro is needed...");

      const decisionResult = await client.generate({
        schema: MacroDecisionSchema,
        schemaName: "macro_decision",
        systemPrompt: `You are analyzing whether a task needs a new reusable capability (macro).

Available macros:
${formatMacrosForPrompt(relevantMacros)}

Consider creating a new macro if:
1. The task requires a capability that doesn't exist
2. The capability would be useful for future tasks
3. It can be expressed as a pure function

Don't create macros for one-off calculations or tasks already well-covered.`,
        userPrompt: `Task: ${task.goal}\n\nShould we create a new macro?`,
        temperature: 0.3,
      });

      if (!isError(decisionResult) && decisionResult.data.needsNewMacro) {
        const spec = decisionResult.data.macroSpec;
        if (spec) {
          this.log(`Creating new macro: ${spec.name}`);
          logs.push(`Creating new macro: ${spec.name} - ${spec.description}`);

          const implResult = await client.generate({
            schema: MacroImplementationSchema,
            schemaName: "macro_implementation",
            systemPrompt: `You are implementing a SAJ macro (procedure).

SAJ procedures have this structure:
{
  "type": "procedure",
  "inputs": ["param1", "param2"],
  "body": { /* SAJ expression */ }
}

Available expression types:
- Primitives: { "type": "number", "value": 42 }
- Variables: { "type": "variable", "key": "param1" }
- Arithmetic: { "type": "arithmeticOperation", "operation": "+", "operands": [...] }
- Comparison: { "type": "comparativeOperation", "operation": ">", "operands": [...] }
- Conditional: { "type": "conditional", "condition": {...}, "trueReturn": {...}, "falseReturn": {...} }

Available macros:
${formatMacrosForPrompt(relevantMacros)}`,
            userPrompt: `Implement this macro:
Name: ${spec.name}
Description: ${spec.description}
Inputs: ${JSON.stringify(spec.inputs)}
Output: ${spec.outputType} - ${spec.outputDescription}`,
            temperature: 0.2,
          });

          if (!isError(implResult)) {
            const newMacro: Macro = {
              name: spec.name,
              description: spec.description,
              tags: spec.tags,
              procedure: implResult.data.procedure as z.infer<typeof SajProcedure>,
              inputs: spec.inputs,
              outputType: spec.outputType,
              outputDescription: spec.outputDescription,
              examples: [implResult.data.example as Macro["examples"][0]],
              createdAt: new Date().toISOString(),
              usageCount: 0,
              successRate: 1.0,
            };

            await this.registry.store(newMacro);
            macrosCreated.push(spec.name);
            relevantMacros.push(newMacro);
            this.log(`Stored new macro: ${spec.name}`);
          }
        }
      }
    }

    this.log("Generating program...");

    const env: KvEnv = { ...(task.env ?? {}) };
    for (const macro of relevantMacros) {
      env[macro.name] = {
        type: "procedureClosure",
        procedure: macro.procedure,
        scopedEnvironment: {},
      };
    }

    const programResult = await client.generate({
      schema: ProgramWithMacrosSchema,
      schemaName: "saj_program_with_macros",
      systemPrompt: `You are generating SAJ programs to accomplish tasks.

Available macros (already loaded in environment):
${formatMacrosForPrompt(relevantMacros)}

To call a macro:
{
  "type": "procedureCall",
  "procedure": { "type": "variable", "key": "macroName" },
  "arguments": [...]
}

${task.context ? `Context: ${task.context}` : ""}`,
      userPrompt: task.goal,
      temperature: 0.5,
    });

    if (isError(programResult)) {
      return {
        success: false,
        result: null,
        program: { type: "boolean", value: false },
        macrosUsed,
        macrosCreated,
        logs: [...logs, `Error: ${programResult.message}`],
        env,
        reasoning: "Failed to generate program",
      };
    }

    const { program, reasoning, macrosUsed: usedMacros } = programResult.data;
    macrosUsed.push(...(usedMacros as string[]));

    this.log("Executing program...");
    logs.push(`Executing: ${JSON.stringify(program).substring(0, 100)}...`);

    try {
      const evalResult = await runProgram(program as z.infer<typeof SajProgram>, {
        env,
        handlers: this.handlers,
      });

      for (const macroName of macrosUsed) {
        await this.registry.recordUsage(macroName, true);
      }

      logs.push(`Result: ${JSON.stringify(evalResult.result)}`);

      return {
        success: true,
        result: evalResult.result,
        program: program as z.infer<typeof SajProgram>,
        macrosUsed,
        macrosCreated,
        logs: [...logs, ...evalResult.logs],
        env: evalResult.env,
        reasoning: reasoning as string,
      };
    } catch (error) {
      for (const macroName of macrosUsed) {
        await this.registry.recordUsage(macroName, false);
      }

      logs.push(`Execution error: ${(error as Error).message}`);

      return {
        success: false,
        result: null,
        program: program as z.infer<typeof SajProgram>,
        macrosUsed,
        macrosCreated,
        logs,
        env,
        reasoning: reasoning as string,
      };
    }
  }

  async executeWithRefinement(task: AgentTask, maxAttempts = 3): Promise<AgentResult> {
    let lastResult: AgentResult | null = null;
    let context = task.context ?? "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.log(`Attempt ${attempt}/${maxAttempts}`);

      const result = await this.execute({
        ...task,
        context:
          context +
          (lastResult && !lastResult.success
            ? `\n\nPrevious attempt failed: ${lastResult.logs.join("; ")}`
            : ""),
      });

      if (result.success) {
        return result;
      }

      lastResult = result;
      context = task.context ?? "";
    }

    return lastResult!;
  }

  async listMacros(): Promise<Macro[]> {
    await this.initialize();
    return this.registry.list();
  }

  async searchMacros(query: string, limit?: number): Promise<Macro[]> {
    await this.initialize();
    return this.registry.search(query, limit);
  }

  async addMacro(macro: Macro): Promise<void> {
    await this.initialize();
    await this.registry.store(macro);
  }
}

export function createAgent(config: AgentConfig = {}): SajAgent {
  return new SajAgent(config);
}
