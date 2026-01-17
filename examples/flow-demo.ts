/**
 * SAJ Flow Demo
 *
 * Demonstrates LLM-powered SAJ program generation and execution
 *
 * Run with: deno run -A examples/flow-demo.ts
 */

import {
  createGenerateSajStep,
  createExecuteSajStep,
  createGenerateAndRunFlow,
  createIterativeFlow,
} from "../lib/saj-flow.ts";

const apiKey = Deno.env.get("OPENAI_API_KEY");

if (!apiKey) {
  console.error("Please set OPENAI_API_KEY environment variable");
  Deno.exit(1);
}

// ///////////////////////////////////////////////////////////////////////////
// Example 1: Generate and manually execute
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 1: Generate + Execute (separate steps) ===\n");

const generateStep = createGenerateSajStep({ apiKey });
const executeStep = createExecuteSajStep();

const generated = await generateStep({
  prompt: "Calculate 2 + 3 * 4",
});

console.log("Generated program:", JSON.stringify(generated.program, null, 2));
console.log("Description:", generated.description);

const executed = await executeStep({
  program: generated.program,
});

console.log("Result:", executed.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 2: Combined generate and run
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 2: Generate and Run (combined) ===\n");

const generateAndRun = createGenerateAndRunFlow({ apiKey });

const result = await generateAndRun({
  prompt: "Check if 100 is greater than 50, if yes return 'big', otherwise return 'small'",
});

console.log("Description:", result.description);
console.log("Program:", JSON.stringify(result.program, null, 2));
console.log("Result:", result.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 3: Using effects
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 3: Effects (KV store) ===\n");

const effectResult = await generateAndRun({
  prompt: "Store the number 42 in KV under key 'answer', then retrieve it and add 10 to it",
});

console.log("Description:", effectResult.description);
console.log("Program:", JSON.stringify(effectResult.program, null, 2));
console.log("Result:", effectResult.result);
console.log("Logs:", effectResult.logs);

// ///////////////////////////////////////////////////////////////////////////
// Example 4: Iterative refinement
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 4: Iterative Flow ===\n");

const iterativeFlow = createIterativeFlow({ apiKey });

const iterativeResult = await iterativeFlow({
  goal: "Create a factorial function and compute factorial of 5",
  maxIterations: 3,
});

console.log("Iterations:", iterativeResult.iterations.length);
for (const [i, iter] of iterativeResult.iterations.entries()) {
  console.log(`\n--- Iteration ${i + 1} ---`);
  console.log("Program:", JSON.stringify(iter.program, null, 2));
  console.log("Result:", iter.result);
}
console.log("\nFinal result:", iterativeResult.finalResult);

// ///////////////////////////////////////////////////////////////////////////
// Example 5: Custom context
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 5: With Context ===\n");

const contextResult = await generateAndRun({
  prompt: "Double the value stored in 'x'",
  env: { x: 21 },
  context: "The variable 'x' is already defined in the environment",
});

console.log("Description:", contextResult.description);
console.log("Result:", contextResult.result);

console.log("\n=== All examples completed! ===\n");
