/**
 * GSM8K Evaluation for SAJ
 *
 * Evaluates SAJ program generation on GSM8K math word problems.
 *
 * Usage:
 *   # Run 100 sample problems
 *   deno run -A --env eval/gsm8k.ts --sample 100
 *
 *   # Run full evaluation
 *   deno run -A --env eval/gsm8k.ts --full
 *
 *   # Generate batch request file for OpenAI Batch API
 *   deno run -A --env eval/gsm8k.ts --batch
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { fromEnv, isError } from "../lib/llm.ts";
import { SajProgram, SajProgramWithMeta } from "../schema.ts";
import { runProgram, createInMemoryHandlers } from "../evaluator.ts";

// ///////////////////////////////////////////////////////////////////////////
// Types
// ///////////////////////////////////////////////////////////////////////////

type GSM8KProblem = {
  question: string;
  answer: string;
};

type EvalResult = {
  id: number;
  question: string;
  expectedAnswer: number;
  generatedProgram: unknown;
  programResult: unknown;
  correct: boolean;
  error?: string;
  durationMs: number;
  macrosUsed?: string[];
};

type EvalSummary = {
  total: number;
  correct: number;
  accuracy: number;
  errors: number;
  avgDurationMs: number;
  macroFrequency: Record<string, number>;
};

// ///////////////////////////////////////////////////////////////////////////
// GSM8K Data Loading
// ///////////////////////////////////////////////////////////////////////////

const GSM8K_URL =
  "https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/test.jsonl";

async function loadGSM8K(): Promise<GSM8KProblem[]> {
  console.log("📥 Loading GSM8K dataset...");
  const response = await fetch(GSM8K_URL);
  const text = await response.text();
  const lines = text.trim().split("\n");
  const problems = lines.map((line) => JSON.parse(line) as GSM8KProblem);
  console.log(`✅ Loaded ${problems.length} problems`);
  return problems;
}

function extractAnswer(answer: string): number {
  // GSM8K answers end with "#### <number>"
  const match = answer.match(/####\s*(-?\d+(?:,\d+)*(?:\.\d+)?)/);
  if (!match) {
    throw new Error(`Could not extract answer from: ${answer}`);
  }
  return parseFloat(match[1].replace(/,/g, ""));
}

// ///////////////////////////////////////////////////////////////////////////
// SAJ Schema Documentation for Math Problems
// ///////////////////////////////////////////////////////////////////////////

const SAJ_MATH_PROMPT = `You are a SAJ program generator that solves math word problems.
SAJ (Scheme As JSON) is a JSON-based programming language.

## SAJ Types for Math:

### Numbers
{ "type": "number", "value": 42 }

### Arithmetic Operations
{
  "type": "arithmeticOperation",
  "operation": "+",  // or "-", "*", "/"
  "operands": [<expr>, <expr>, ...]
}

### Variables (for intermediate results)
{ "type": "variable", "key": "x" }

### Let Bindings (to store intermediate calculations)
{
  "type": "effect",
  "action": "let",
  "binding": "varName",
  "value": <expr>,
  "body": <expr that can use varName>
}

### Sequences (for multi-step calculations)
{
  "type": "effect",
  "action": "sequence",
  "steps": [<expr>, <expr>, ...]
}

## Example: "John has 5 apples and buys 3 more. How many does he have?"
{
  "description": "Calculates total apples: 5 + 3",
  "program": {
    "type": "arithmeticOperation",
    "operation": "+",
    "operands": [
      { "type": "number", "value": 5 },
      { "type": "number", "value": 3 }
    ]
  }
}

## Example with intermediate steps: "A store sells 20 items at $5 each, minus $15 discount"
{
  "description": "Calculates total: (20 * 5) - 15",
  "program": {
    "type": "effect",
    "action": "let",
    "binding": "subtotal",
    "value": {
      "type": "arithmeticOperation",
      "operation": "*",
      "operands": [
        { "type": "number", "value": 20 },
        { "type": "number", "value": 5 }
      ]
    },
    "body": {
      "type": "arithmeticOperation",
      "operation": "-",
      "operands": [
        { "type": "variable", "key": "subtotal" },
        { "type": "number", "value": 15 }
      ]
    }
  }
}

IMPORTANT: Always respond with a JSON object containing:
- "description": Brief description of the calculation steps
- "program": The SAJ program that computes the final numerical answer

The program should evaluate to a single number (the answer).`;

// ///////////////////////////////////////////////////////////////////////////
// Evaluation Logic
// ///////////////////////////////////////////////////////////////////////////

async function evaluateProblem(
  problem: GSM8KProblem,
  id: number,
  client: ReturnType<typeof fromEnv>
): Promise<EvalResult> {
  const start = performance.now();
  const expectedAnswer = extractAnswer(problem.answer);

  try {
    // Generate SAJ program
    const result = await client.generate({
      schema: SajProgramWithMeta,
      schemaName: "saj_math_program",
      schemaDescription: "A SAJ program that solves the math problem",
      systemPrompt: SAJ_MATH_PROMPT,
      userPrompt: `Solve this math problem and return a SAJ program that computes the answer:\n\n${problem.question}`,
      temperature: 0.3, // Lower temperature for math
    });

    if (isError(result)) {
      return {
        id,
        question: problem.question,
        expectedAnswer,
        generatedProgram: null,
        programResult: null,
        correct: false,
        error: result.message,
        durationMs: Math.round(performance.now() - start),
      };
    }

    const program = result.data.program;

    // Execute the SAJ program
    const handlers = createInMemoryHandlers();
    const execResult = await runProgram(program as z.infer<typeof SajProgram>, {
      handlers,
    });

    const programResult = execResult.result;
    const numericResult =
      typeof programResult === "number" ? programResult : NaN;

    // Check if answer is correct (with small tolerance for floating point)
    const correct = Math.abs(numericResult - expectedAnswer) < 0.01;

    // Extract macros/patterns used
    const macrosUsed = extractMacros(program);

    return {
      id,
      question: problem.question,
      expectedAnswer,
      generatedProgram: program,
      programResult,
      correct,
      durationMs: Math.round(performance.now() - start),
      macrosUsed,
    };
  } catch (e) {
    return {
      id,
      question: problem.question,
      expectedAnswer,
      generatedProgram: null,
      programResult: null,
      correct: false,
      error: (e as Error).message,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

function extractMacros(program: unknown): string[] {
  const macros: string[] = [];
  const seen = new Set<string>();

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;

    const obj = node as Record<string, unknown>;

    // Track operation types
    if (obj.type === "arithmeticOperation" && obj.operation) {
      const key = `arithmetic:${obj.operation}`;
      if (!seen.has(key)) {
        seen.add(key);
        macros.push(key);
      }
    }

    if (obj.type === "effect" && obj.action) {
      const key = `effect:${obj.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        macros.push(key);
      }
    }

    if (obj.type === "comparativeOperation" && obj.operation) {
      const key = `compare:${obj.operation}`;
      if (!seen.has(key)) {
        seen.add(key);
        macros.push(key);
      }
    }

    if (obj.type === "conditional") {
      if (!seen.has("conditional")) {
        seen.add("conditional");
        macros.push("conditional");
      }
    }

    if (obj.type === "procedureCall") {
      if (!seen.has("procedureCall")) {
        seen.add("procedureCall");
        macros.push("procedureCall");
      }
    }

    // Recurse
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
        }
      } else {
        walk(value);
      }
    }
  }

  walk(program);
  return macros;
}

function summarizeResults(results: EvalResult[]): EvalSummary {
  const correct = results.filter((r) => r.correct).length;
  const errors = results.filter((r) => r.error).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  // Count macro frequency
  const macroFrequency: Record<string, number> = {};
  for (const result of results) {
    if (result.macrosUsed) {
      for (const macro of result.macrosUsed) {
        macroFrequency[macro] = (macroFrequency[macro] || 0) + 1;
      }
    }
  }

  return {
    total: results.length,
    correct,
    accuracy: correct / results.length,
    errors,
    avgDurationMs: Math.round(totalDuration / results.length),
    macroFrequency,
  };
}

// ///////////////////////////////////////////////////////////////////////////
// Batch Request Generation (for OpenAI Batch API)
// ///////////////////////////////////////////////////////////////////////////

function generateBatchRequests(problems: GSM8KProblem[]): string {
  const requests = problems.map((problem, idx) => ({
    custom_id: `gsm8k-${idx}`,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SAJ_MATH_PROMPT },
        {
          role: "user",
          content: `Solve this math problem and return a SAJ program that computes the answer:\n\n${problem.question}\n\nRespond with valid JSON only.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1024,
    },
  }));

  // Return as JSONL
  return requests.map((r) => JSON.stringify(r)).join("\n");
}

// ///////////////////////////////////////////////////////////////////////////
// Main
// ///////////////////////////////////////////////////////////////////////////

async function main() {
  const args = Deno.args;

  const isSample = args.includes("--sample");
  const isFull = args.includes("--full");
  const isBatch = args.includes("--batch");

  const sampleSize = isSample
    ? parseInt(args[args.indexOf("--sample") + 1] || "100")
    : 100;

  const problems = await loadGSM8K();

  if (isBatch) {
    // Generate batch request file
    console.log("\n📦 Generating batch request file...");
    const batchContent = generateBatchRequests(problems);
    const filename = "eval/gsm8k_batch_requests.jsonl";
    await Deno.writeTextFile(filename, batchContent);
    console.log(`✅ Wrote ${problems.length} requests to ${filename}`);
    console.log("\nTo submit batch:");
    console.log("1. Upload file to OpenAI: openai api files.create -f gsm8k_batch_requests.jsonl -p batch");
    console.log("2. Create batch: openai api batches.create -i <file_id> -e /v1/chat/completions -c 24h");
    return;
  }

  // Select problems
  const selectedProblems = isFull ? problems : problems.slice(0, sampleSize);
  console.log(`\n🧮 Evaluating ${selectedProblems.length} problems...\n`);

  const client = fromEnv();
  const results: EvalResult[] = [];

  for (let i = 0; i < selectedProblems.length; i++) {
    const problem = selectedProblems[i];
    process.stdout?.write?.(`\r[${i + 1}/${selectedProblems.length}] Evaluating...`);

    const result = await evaluateProblem(problem, i, client);
    results.push(result);

    // Log individual result
    const status = result.correct ? "✅" : result.error ? "❌" : "❓";
    console.log(
      `\n${status} #${i + 1}: Expected ${result.expectedAnswer}, Got ${result.programResult}`
    );

    if (result.error) {
      console.log(`   Error: ${result.error.slice(0, 100)}`);
    }

    // Save intermediate results every 10 problems
    if ((i + 1) % 10 === 0) {
      await Deno.writeTextFile(
        "eval/gsm8k_results_partial.json",
        JSON.stringify({ results, summary: summarizeResults(results) }, null, 2)
      );
    }

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Final summary
  const summary = summarizeResults(results);

  console.log("\n" + "=".repeat(60));
  console.log("📊 EVALUATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total Problems: ${summary.total}`);
  console.log(`Correct: ${summary.correct}`);
  console.log(`Accuracy: ${(summary.accuracy * 100).toFixed(2)}%`);
  console.log(`Errors: ${summary.errors}`);
  console.log(`Avg Duration: ${summary.avgDurationMs}ms`);
  console.log("\n📐 Macro Frequency:");
  const sortedMacros = Object.entries(summary.macroFrequency).sort(
    (a, b) => b[1] - a[1]
  );
  for (const [macro, count] of sortedMacros) {
    console.log(`  ${macro}: ${count} (${((count / summary.total) * 100).toFixed(1)}%)`);
  }

  // Save final results
  const outputFile = isFull
    ? "eval/gsm8k_results_full.json"
    : "eval/gsm8k_results_sample.json";

  await Deno.writeTextFile(
    outputFile,
    JSON.stringify({ results, summary }, null, 2)
  );
  console.log(`\n💾 Results saved to ${outputFile}`);
}

main().catch(console.error);
