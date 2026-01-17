/**
 * SAJ Flow Demo
 *
 * Demonstrates LLM-powered SAJ program generation and execution
 * with support for both OpenAI and Anthropic providers.
 *
 * Run with:
 *   OPENAI_API_KEY=... deno run -A examples/flow-demo.ts
 *   ANTHROPIC_API_KEY=... deno run -A examples/flow-demo.ts
 *   # Or set both and specify which to use
 */

import {
  createGenerateSajStep,
  createExecuteSajStep,
  createGenerateAndRunFlow,
  createIterativeFlow,
  type LLMProvider,
} from "../experiments/self-extending-agent/saj-flow.ts";

// Detect which provider to use based on available API keys
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

if (!anthropicKey && !openaiKey) {
  console.error(
    "Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable",
  );
  Deno.exit(1);
}

const provider: LLMProvider = anthropicKey ? "anthropic" : "openai";
console.log(`\n🤖 Using provider: ${provider}\n`);

// ///////////////////////////////////////////////////////////////////////////
// Example 1: Generate and manually execute
// ///////////////////////////////////////////////////////////////////////////

console.log("=== Example 1: Generate + Execute (separate steps) ===\n");

// The steps auto-detect provider from environment
const generateStep = createGenerateSajStep();
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

const generateAndRun = createGenerateAndRunFlow();

const result = await generateAndRun({
  prompt:
    "Check if 100 is greater than 50, if yes return 'big', otherwise return 'small'",
});

console.log("Description:", result.description);
console.log("Program:", JSON.stringify(result.program, null, 2));
console.log("Result:", result.result);

// ///////////////////////////////////////////////////////////////////////////
// Example 3: Using effects
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 3: Effects (KV store) ===\n");

const effectResult = await generateAndRun({
  prompt:
    "Store the number 42 in KV under key 'answer', then retrieve it and add 10 to it",
});

console.log("Description:", effectResult.description);
console.log("Program:", JSON.stringify(effectResult.program, null, 2));
console.log("Result:", effectResult.result);
console.log("Logs:", effectResult.logs);

// ///////////////////////////////////////////////////////////////////////////
// Example 4: Explicitly choosing a provider (if both keys are available)
// ///////////////////////////////////////////////////////////////////////////

if (anthropicKey && openaiKey) {
  console.log("\n=== Example 4: Explicit Provider Selection ===\n");

  // Force use of a specific provider
  const anthropicResult = await generateAndRun({
    prompt: "Return the string 'Hello from Claude!'",
    provider: "anthropic",
  });
  console.log("Anthropic result:", anthropicResult.result);

  const openaiResult = await generateAndRun({
    prompt: "Return the string 'Hello from GPT!'",
    provider: "openai",
  });
  console.log("OpenAI result:", openaiResult.result);
} else {
  console.log("\n=== Example 4: Skipped (only one provider configured) ===\n");
}

// ///////////////////////////////////////////////////////////////////////////
// Example 5: Iterative refinement
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 5: Iterative Flow ===\n");

const iterativeFlow = createIterativeFlow();

const iterativeResult = await iterativeFlow({
  goal: "Calculate the sum of 1 + 2 + 3 + 4 + 5",
  maxIterations: 2,
});

console.log("Iterations:", iterativeResult.iterations.length);
for (const [i, iter] of iterativeResult.iterations.entries()) {
  console.log(`\n--- Iteration ${i + 1} ---`);
  console.log("Program:", JSON.stringify(iter.program, null, 2));
  console.log("Result:", iter.result);
}
console.log("\nFinal result:", iterativeResult.finalResult);

// ///////////////////////////////////////////////////////////////////////////
// Example 6: Custom context
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 6: With Context ===\n");

const contextResult = await generateAndRun({
  prompt: "Double the value stored in 'x'",
  env: { x: 21 },
  context: "The variable 'x' is already defined in the environment",
});

console.log("Description:", contextResult.description);
console.log("Result:", contextResult.result);

console.log("\n=== All examples completed! ===\n");
