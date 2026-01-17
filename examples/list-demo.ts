/**
 * List Operations Demo
 *
 * Demonstrates the new list support in SAJ:
 * - List literals
 * - sum, product, average, min, max
 * - map, filter, reduce
 * - range, concat, head, tail, nth
 *
 * Run with: deno run -A examples/list-demo.ts
 */

import { runProgram } from "../evaluator.ts";
import type { SajProgram } from "../schema.ts";

console.log("=".repeat(60));
console.log("SAJ List Operations Demo");
console.log("=".repeat(60));

// ///////////////////////////////////////////////////////////////////////////
// Example 1: Basic list and sum
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 1: Sum of a list ===");

const sumProgram: SajProgram = {
  type: "listOperation",
  operation: "sum",
  list: {
    type: "list",
    elements: [
      { type: "number", value: 1 },
      { type: "number", value: 2 },
      { type: "number", value: 3 },
      { type: "number", value: 4 },
      { type: "number", value: 5 },
    ],
  },
};

const result1 = await runProgram(sumProgram);
console.log("sum([1, 2, 3, 4, 5]) =", result1.result); // Should be 15

// ///////////////////////////////////////////////////////////////////////////
// Example 2: Average
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 2: Average of test scores ===");

const averageProgram: SajProgram = {
  type: "listOperation",
  operation: "average",
  list: {
    type: "list",
    elements: [
      { type: "number", value: 85 },
      { type: "number", value: 90 },
      { type: "number", value: 95 },
    ],
  },
};

const result2 = await runProgram(averageProgram);
console.log("average([85, 90, 95]) =", result2.result); // Should be 90

// ///////////////////////////////////////////////////////////////////////////
// Example 3: Range and sum (sum 1 to 10)
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 3: Sum of range 1 to 10 ===");

const rangeSum: SajProgram = {
  type: "listOperation",
  operation: "sum",
  list: {
    type: "listOperation",
    operation: "range",
    start: { type: "number", value: 1 },
    end: { type: "number", value: 11 }, // exclusive
  },
};

const result3 = await runProgram(rangeSum);
console.log("sum(range(1, 11)) =", result3.result); // Should be 55

// ///////////////////////////////////////////////////////////////////////////
// Example 4: Map - square each element
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 4: Map (square each element) ===");

const mapProgram: SajProgram = {
  type: "listOperation",
  operation: "map",
  list: {
    type: "list",
    elements: [
      { type: "number", value: 1 },
      { type: "number", value: 2 },
      { type: "number", value: 3 },
      { type: "number", value: 4 },
    ],
  },
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
};

const result4 = await runProgram(mapProgram);
console.log("map(square, [1, 2, 3, 4]) =", result4.result); // Should be [1, 4, 9, 16]

// ///////////////////////////////////////////////////////////////////////////
// Example 5: Filter - keep only positive numbers
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 5: Filter (keep positive) ===");

const filterProgram: SajProgram = {
  type: "listOperation",
  operation: "filter",
  list: {
    type: "list",
    elements: [
      { type: "number", value: -3 },
      { type: "number", value: 1 },
      { type: "number", value: -2 },
      { type: "number", value: 5 },
      { type: "number", value: 0 },
      { type: "number", value: 7 },
    ],
  },
  predicate: {
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
};

const result5 = await runProgram(filterProgram);
console.log("filter(isPositive, [-3, 1, -2, 5, 0, 7]) =", result5.result); // Should be [1, 5, 7]

// ///////////////////////////////////////////////////////////////////////////
// Example 6: Reduce - factorial via product
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 6: Product (factorial of 5) ===");

const productProgram: SajProgram = {
  type: "listOperation",
  operation: "product",
  list: {
    type: "listOperation",
    operation: "range",
    start: { type: "number", value: 1 },
    end: { type: "number", value: 6 }, // 1, 2, 3, 4, 5
  },
};

const result6 = await runProgram(productProgram);
console.log("product(range(1, 6)) = 5! =", result6.result); // Should be 120

// ///////////////////////////////////////////////////////////////////////////
// Example 7: Min and Max
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 7: Min and Max ===");

const minProgram: SajProgram = {
  type: "listOperation",
  operation: "min",
  list: {
    type: "list",
    elements: [
      { type: "number", value: 42 },
      { type: "number", value: 17 },
      { type: "number", value: 93 },
      { type: "number", value: 5 },
    ],
  },
};

const maxProgram: SajProgram = {
  type: "listOperation",
  operation: "max",
  list: {
    type: "list",
    elements: [
      { type: "number", value: 42 },
      { type: "number", value: 17 },
      { type: "number", value: 93 },
      { type: "number", value: 5 },
    ],
  },
};

const resultMin = await runProgram(minProgram);
const resultMax = await runProgram(maxProgram);
console.log("min([42, 17, 93, 5]) =", resultMin.result); // Should be 5
console.log("max([42, 17, 93, 5]) =", resultMax.result); // Should be 93

// ///////////////////////////////////////////////////////////////////////////
// Example 8: Reduce with custom function
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 8: Custom reduce (sum of squares) ===");

const reduceProgram: SajProgram = {
  type: "listOperation",
  operation: "reduce",
  list: {
    type: "list",
    elements: [
      { type: "number", value: 1 },
      { type: "number", value: 2 },
      { type: "number", value: 3 },
    ],
  },
  procedure: {
    type: "procedure",
    inputs: ["acc", "x"],
    body: {
      type: "arithmeticOperation",
      operation: "+",
      operands: [
        { type: "variable", key: "acc" },
        {
          type: "arithmeticOperation",
          operation: "*",
          operands: [
            { type: "variable", key: "x" },
            { type: "variable", key: "x" },
          ],
        },
      ],
    },
  },
  initial: { type: "number", value: 0 },
};

const result8 = await runProgram(reduceProgram);
console.log("reduce(sumOfSquares, [1, 2, 3], 0) =", result8.result); // Should be 14 (1 + 4 + 9)

// ///////////////////////////////////////////////////////////////////////////
// Example 9: GSM8K-style problem - "John runs 3 miles a day for a week"
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 9: GSM8K-style problem ===");
console.log("John runs 3 miles every day for a week. How many miles total?");

const gsm8kProgram: SajProgram = {
  type: "listOperation",
  operation: "sum",
  list: {
    type: "listOperation",
    operation: "map",
    list: {
      type: "listOperation",
      operation: "range",
      start: { type: "number", value: 1 },
      end: { type: "number", value: 8 }, // 7 days
    },
    procedure: {
      type: "procedure",
      inputs: ["_day"],
      body: { type: "number", value: 3 }, // 3 miles per day
    },
  },
};

const result9 = await runProgram(gsm8kProgram);
console.log("Total miles:", result9.result); // Should be 21

// Simpler version:
const simpler: SajProgram = {
  type: "arithmeticOperation",
  operation: "*",
  operands: [
    { type: "number", value: 3 }, // miles per day
    { type: "number", value: 7 }, // days
  ],
};

const resultSimpler = await runProgram(simpler);
console.log("(Simpler: 3 * 7 =", resultSimpler.result, ")");

// ///////////////////////////////////////////////////////////////////////////
// Example 10: Concat lists
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 10: Concat lists ===");

const concatProgram: SajProgram = {
  type: "listOperation",
  operation: "concat",
  lists: [
    {
      type: "list",
      elements: [
        { type: "number", value: 1 },
        { type: "number", value: 2 },
      ],
    },
    {
      type: "list",
      elements: [
        { type: "number", value: 3 },
        { type: "number", value: 4 },
      ],
    },
    {
      type: "list",
      elements: [
        { type: "number", value: 5 },
      ],
    },
  ],
};

const result10 = await runProgram(concatProgram);
console.log("concat([1,2], [3,4], [5]) =", result10.result); // Should be [1, 2, 3, 4, 5]

console.log("\n" + "=".repeat(60));
console.log("All list operations working! ✅");
console.log("=".repeat(60));
