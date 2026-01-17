/**
 * SAJ Macro System
 *
 * Macros are reusable SAJ procedures stored in KV with metadata.
 * Tool calling becomes native - tools are just procedures in KV.
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { SajProcedure } from "../../core/schema.ts";

export const MacroSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  procedure: SajProcedure,
  inputs: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
    })
  ),
  outputType: z.string(),
  outputDescription: z.string(),
  examples: z.array(
    z.object({
      description: z.string(),
      call: z.any(),
      expectedResult: z.any(),
    })
  ),
  createdAt: z.string(),
  usageCount: z.number().default(0),
  successRate: z.number().default(1.0),
});

export type Macro = z.infer<typeof MacroSchema>;

export interface MacroRegistry {
  store(macro: Macro): Promise<void>;
  get(name: string): Promise<Macro | null>;
  delete(name: string): Promise<void>;
  search(query: string, limit?: number): Promise<Macro[]>;
  list(prefix?: string): Promise<Macro[]>;
  recordUsage(name: string, success: boolean): Promise<void>;
}

export class InMemoryMacroRegistry implements MacroRegistry {
  private macros = new Map<string, Macro>();

  async store(macro: Macro): Promise<void> {
    this.macros.set(macro.name, macro);
  }

  async get(name: string): Promise<Macro | null> {
    return this.macros.get(name) ?? null;
  }

  async delete(name: string): Promise<void> {
    this.macros.delete(name);
  }

  async search(query: string, limit = 10): Promise<Macro[]> {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = [...this.macros.values()].map((macro) => {
      let score = 0;

      if (macro.name.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      const descLower = macro.description.toLowerCase();
      for (const term of queryTerms) {
        if (descLower.includes(term)) score += 3;
      }

      for (const tag of macro.tags) {
        const tagLower = tag.toLowerCase();
        for (const term of queryTerms) {
          if (tagLower.includes(term)) score += 5;
        }
      }

      score *= 1 + macro.usageCount * 0.01;
      score *= macro.successRate;

      return { macro, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.macro);
  }

  async list(_prefix?: string): Promise<Macro[]> {
    return [...this.macros.values()];
  }

  async recordUsage(name: string, success: boolean): Promise<void> {
    const macro = this.macros.get(name);
    if (macro) {
      macro.usageCount++;
      macro.successRate = macro.successRate * 0.9 + (success ? 1 : 0) * 0.1;
    }
  }
}

export class DenoKvMacroRegistry implements MacroRegistry {
  constructor(private kv: Deno.Kv, private prefix = "macros") {}

  private key(name: string): Deno.KvKey {
    return [this.prefix, name];
  }

  async store(macro: Macro): Promise<void> {
    await this.kv.set(this.key(macro.name), macro);

    for (const tag of macro.tags) {
      await this.kv.set([this.prefix, "_tags", tag, macro.name], true);
    }
  }

  async get(name: string): Promise<Macro | null> {
    const result = await this.kv.get<Macro>(this.key(name));
    return result.value;
  }

  async delete(name: string): Promise<void> {
    const macro = await this.get(name);
    if (macro) {
      for (const tag of macro.tags) {
        await this.kv.delete([this.prefix, "_tags", tag, macro.name]);
      }
    }
    await this.kv.delete(this.key(name));
  }

  async search(query: string, limit = 10): Promise<Macro[]> {
    const all = await this.list();
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = all.map((macro) => {
      let score = 0;

      if (macro.name.toLowerCase().includes(queryLower)) score += 10;

      const descLower = macro.description.toLowerCase();
      for (const term of queryTerms) {
        if (descLower.includes(term)) score += 3;
      }

      for (const tag of macro.tags) {
        const tagLower = tag.toLowerCase();
        for (const term of queryTerms) {
          if (tagLower.includes(term)) score += 5;
        }
      }

      score *= 1 + macro.usageCount * 0.01;
      score *= macro.successRate;

      return { macro, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.macro);
  }

  async list(_prefix?: string): Promise<Macro[]> {
    const macros: Macro[] = [];
    const iter = this.kv.list<Macro>({ prefix: [this.prefix] });

    for await (const entry of iter) {
      if (entry.key[1] === "_tags") continue;
      if (entry.value) macros.push(entry.value);
    }

    return macros;
  }

  async recordUsage(name: string, success: boolean): Promise<void> {
    const macro = await this.get(name);
    if (macro) {
      macro.usageCount++;
      macro.successRate = macro.successRate * 0.9 + (success ? 1 : 0) * 0.1;
      await this.store(macro);
    }
  }
}

export const BUILTIN_MACROS: Macro[] = [
  {
    name: "square",
    description: "Calculate the square of a number (x * x)",
    tags: ["math", "arithmetic", "power", "multiply"],
    procedure: {
      type: "procedure",
      inputs: ["x"],
      body: {
        type: "arithmeticOperation",
        operation: "*",
        operands: [
          { type: "variable", key: "x" },
          { type: "variable", key: "x" },
        ],
      },
    },
    inputs: [{ name: "x", type: "number", description: "The number to square" }],
    outputType: "number",
    outputDescription: "The square of x",
    examples: [
      {
        description: "Square of 5",
        call: {
          type: "procedureCall",
          procedure: { type: "variable", key: "square" },
          arguments: [{ type: "number", value: 5 }],
        },
        expectedResult: 25,
      },
    ],
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successRate: 1.0,
  },
  {
    name: "double",
    description: "Double a number (x * 2)",
    tags: ["math", "arithmetic", "multiply"],
    procedure: {
      type: "procedure",
      inputs: ["x"],
      body: {
        type: "arithmeticOperation",
        operation: "*",
        operands: [
          { type: "variable", key: "x" },
          { type: "number", value: 2 },
        ],
      },
    },
    inputs: [{ name: "x", type: "number", description: "The number to double" }],
    outputType: "number",
    outputDescription: "The double of x",
    examples: [
      {
        description: "Double of 7",
        call: {
          type: "procedureCall",
          procedure: { type: "variable", key: "double" },
          arguments: [{ type: "number", value: 7 }],
        },
        expectedResult: 14,
      },
    ],
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successRate: 1.0,
  },
  {
    name: "isPositive",
    description: "Check if a number is positive (greater than zero)",
    tags: ["math", "comparison", "check", "boolean"],
    procedure: {
      type: "procedure",
      inputs: ["x"],
      body: {
        type: "comparativeOperation",
        operation: ">",
        operands: [
          { type: "variable", key: "x" },
          { type: "number", value: 0 },
        ],
      },
    },
    inputs: [{ name: "x", type: "number", description: "The number to check" }],
    outputType: "boolean",
    outputDescription: "True if x > 0, false otherwise",
    examples: [
      {
        description: "Check if 5 is positive",
        call: {
          type: "procedureCall",
          procedure: { type: "variable", key: "isPositive" },
          arguments: [{ type: "number", value: 5 }],
        },
        expectedResult: true,
      },
    ],
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successRate: 1.0,
  },
  {
    name: "abs",
    description: "Calculate the absolute value of a number",
    tags: ["math", "arithmetic", "absolute"],
    procedure: {
      type: "procedure",
      inputs: ["x"],
      body: {
        type: "conditional",
        condition: {
          type: "comparativeOperation",
          operation: ">=",
          operands: [
            { type: "variable", key: "x" },
            { type: "number", value: 0 },
          ],
        },
        trueReturn: { type: "variable", key: "x" },
        falseReturn: {
          type: "arithmeticOperation",
          operation: "*",
          operands: [
            { type: "variable", key: "x" },
            { type: "number", value: -1 },
          ],
        },
      },
    },
    inputs: [{ name: "x", type: "number", description: "The number" }],
    outputType: "number",
    outputDescription: "The absolute value of x",
    examples: [
      {
        description: "Absolute value of -5",
        call: {
          type: "procedureCall",
          procedure: { type: "variable", key: "abs" },
          arguments: [{ type: "number", value: -5 }],
        },
        expectedResult: 5,
      },
    ],
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successRate: 1.0,
  },
  {
    name: "max",
    description: "Return the maximum of two numbers",
    tags: ["math", "comparison", "maximum"],
    procedure: {
      type: "procedure",
      inputs: ["a", "b"],
      body: {
        type: "conditional",
        condition: {
          type: "comparativeOperation",
          operation: ">",
          operands: [
            { type: "variable", key: "a" },
            { type: "variable", key: "b" },
          ],
        },
        trueReturn: { type: "variable", key: "a" },
        falseReturn: { type: "variable", key: "b" },
      },
    },
    inputs: [
      { name: "a", type: "number", description: "First number" },
      { name: "b", type: "number", description: "Second number" },
    ],
    outputType: "number",
    outputDescription: "The larger of a and b",
    examples: [
      {
        description: "Max of 3 and 7",
        call: {
          type: "procedureCall",
          procedure: { type: "variable", key: "max" },
          arguments: [
            { type: "number", value: 3 },
            { type: "number", value: 7 },
          ],
        },
        expectedResult: 7,
      },
    ],
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successRate: 1.0,
  },
  {
    name: "min",
    description: "Return the minimum of two numbers",
    tags: ["math", "comparison", "minimum"],
    procedure: {
      type: "procedure",
      inputs: ["a", "b"],
      body: {
        type: "conditional",
        condition: {
          type: "comparativeOperation",
          operation: "<",
          operands: [
            { type: "variable", key: "a" },
            { type: "variable", key: "b" },
          ],
        },
        trueReturn: { type: "variable", key: "a" },
        falseReturn: { type: "variable", key: "b" },
      },
    },
    inputs: [
      { name: "a", type: "number", description: "First number" },
      { name: "b", type: "number", description: "Second number" },
    ],
    outputType: "number",
    outputDescription: "The smaller of a and b",
    examples: [
      {
        description: "Min of 3 and 7",
        call: {
          type: "procedureCall",
          procedure: { type: "variable", key: "min" },
          arguments: [
            { type: "number", value: 3 },
            { type: "number", value: 7 },
          ],
        },
        expectedResult: 3,
      },
    ],
    createdAt: new Date().toISOString(),
    usageCount: 0,
    successRate: 1.0,
  },
];

export async function initializeRegistry(registry: MacroRegistry): Promise<void> {
  for (const macro of BUILTIN_MACROS) {
    const existing = await registry.get(macro.name);
    if (!existing) {
      await registry.store(macro);
    }
  }
}

export function formatMacrosForPrompt(macros: Macro[]): string {
  if (macros.length === 0) return "No relevant macros found.";

  return macros
    .map((m) => {
      const inputsStr = m.inputs
        .map((i) => `  - ${i.name}: ${i.type} - ${i.description}`)
        .join("\n");

      const exampleStr = m.examples[0]
        ? `\n  Example: ${JSON.stringify(m.examples[0].call)} => ${m.examples[0].expectedResult}`
        : "";

      return `## ${m.name}
${m.description}
Inputs:
${inputsStr}
Returns: ${m.outputType} - ${m.outputDescription}${exampleStr}`;
    })
    .join("\n\n");
}
