/**
 * SAJ Evaluator Demo
 *
 * Demonstrates the TypeScript evaluator with effects
 *
 * Run with: deno run -A examples/eval-demo.ts
 */

import { runProgram, createInMemoryHandlers } from "../core/evaluator.ts";
import type { SajProgram } from "../core/schema.ts";

// ///////////////////////////////////////////////////////////////////////////
// Example 1: Simple arithmetic
// ///////////////////////////////////////////////////////////////////////////

console.log("=== Example 1: Arithmetic ===");

const addProgram: SajProgram = {
  type: "arithmeticOperation",
  operation: "+",
  operands: [
    { type: "number", value: 10 },
    { type: "number", value: 20 },
    { type: "number", value: 12 },
  ],
};

const result1 = await runProgram(addProgram);
console.log("10 + 20 + 12 =", result1.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 2: Conditional
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 2: Conditional ===");

const conditionalProgram: SajProgram = {
  type: "conditional",
  condition: {
    type: "comparativeOperation",
    operation: ">",
    operands: [
      { type: "number", value: 100 },
      { type: "number", value: 50 },
    ],
  },
  trueReturn: { type: "string", value: "100 is bigger!" },
  falseReturn: { type: "string", value: "50 is bigger!" },
};

const result2 = await runProgram(conditionalProgram);
console.log("Result:", result2.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 3: Lambda and procedure call
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 3: Lambda ===");

const squareProgram: SajProgram = {
  type: "procedureCall",
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
  arguments: [{ type: "number", value: 7 }],
};

const result3 = await runProgram(squareProgram);
console.log("7 squared =", result3.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 4: Effects - KV store
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 4: KV Effects ===");

const handlers = createInMemoryHandlers();

// Store a value
const storeProgram: SajProgram = {
  type: "effect",
  action: "kv:set",
  key: "greeting",
  value: { type: "string", value: "Hello, SAJ!" },
};

await runProgram(storeProgram, { handlers });
console.log("Stored 'greeting' in KV");

// Retrieve it
const getProgram: SajProgram = {
  type: "effect",
  action: "kv:get",
  key: "greeting",
};

const result4 = await runProgram(getProgram, { handlers });
console.log("Retrieved:", result4.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 5: Sequence with let binding
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 5: Sequence with Let ===");

const sequenceProgram: SajProgram = {
  type: "effect",
  action: "sequence",
  steps: [
    {
      type: "effect",
      action: "kv:set",
      key: "counter",
      value: { type: "number", value: 0 },
    },
    {
      type: "effect",
      action: "let",
      binding: "current",
      value: {
        type: "effect",
        action: "kv:get",
        key: "counter",
      },
      body: {
        type: "effect",
        action: "kv:set",
        key: "counter",
        value: {
          type: "arithmeticOperation",
          operation: "+",
          operands: [
            { type: "variable", key: "current" },
            { type: "number", value: 1 },
          ],
        },
      },
    },
    {
      type: "effect",
      action: "kv:get",
      key: "counter",
    },
  ],
};

const result5 = await runProgram(sequenceProgram, { handlers });
console.log("Counter after increment:", result5.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 6: Logging
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 6: Logging ===");

const logProgram: SajProgram = {
  type: "effect",
  action: "sequence",
  steps: [
    {
      type: "effect",
      action: "log",
      message: { type: "string", value: "Starting computation..." },
    },
    {
      type: "arithmeticOperation",
      operation: "*",
      operands: [
        { type: "number", value: 6 },
        { type: "number", value: 7 },
      ],
    },
  ],
};

const result6 = await runProgram(logProgram, { handlers });
console.log("Final result:", result6.result);
console.log("Captured logs:", result6.logs);

console.log("\n=== All examples completed! ===");
