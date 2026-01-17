/**
 * Self-Extending Agent Demo
 *
 * Demonstrates an agent that:
 * 1. Uses existing macros (tools) to solve tasks
 * 2. Creates NEW macros when capabilities are missing
 * 3. Stores new macros for future use
 *
 * Run with:
 *   OPENAI_API_KEY=... deno run -A examples/agent-demo.ts
 *   ANTHROPIC_API_KEY=... deno run -A examples/agent-demo.ts
 */

import { createAgent } from "../experiments/self-extending-agent/agent.ts";

// Check for API key
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

if (!anthropicKey && !openaiKey) {
  console.error(
    "Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable"
  );
  Deno.exit(1);
}

const provider = anthropicKey ? "anthropic" : "openai";
console.log(`\n🤖 Using provider: ${provider}\n`);

// Create the agent with verbose logging
const agent = createAgent({
  provider,
  verbose: true,
  enableMacroCreation: true,
});

// ///////////////////////////////////////////////////////////////////////////
// Example 1: Use existing macros
// ///////////////////////////////////////////////////////////////////////////

console.log("=".repeat(60));
console.log("Example 1: Using existing macros");
console.log("=".repeat(60));

const result1 = await agent.execute({
  goal: "Calculate the square of 7",
});

console.log("\nResult:", result1.result);
console.log("Macros used:", result1.macrosUsed);
console.log("Reasoning:", result1.reasoning);

// ///////////////////////////////////////////////////////////////////////////
// Example 2: Task that might need a new macro
// ///////////////////////////////////////////////////////////////////////////

console.log("\n" + "=".repeat(60));
console.log("Example 2: Task requiring new capability");
console.log("=".repeat(60));

const result2 = await agent.execute({
  goal: "Calculate the cube of 4 (4 * 4 * 4)",
});

console.log("\nResult:", result2.result);
console.log("Macros used:", result2.macrosUsed);
console.log("Macros created:", result2.macrosCreated);
console.log("Reasoning:", result2.reasoning);

// ///////////////////////////////////////////////////////////////////////////
// Example 3: Verify the new macro exists
// ///////////////////////////////////////////////////////////////////////////

console.log("\n" + "=".repeat(60));
console.log("Example 3: List all available macros");
console.log("=".repeat(60));

const macros = await agent.listMacros();
console.log("\nAvailable macros:");
for (const macro of macros) {
  console.log(`  - ${macro.name}: ${macro.description}`);
}

// ///////////////////////////////////////////////////////////////////////////
// Example 4: Use the newly created macro (if created)
// ///////////////////////////////////////////////////////////////////////////

if (result2.macrosCreated.length > 0) {
  console.log("\n" + "=".repeat(60));
  console.log("Example 4: Reuse the newly created macro");
  console.log("=".repeat(60));

  const result3 = await agent.execute({
    goal: "Calculate the cube of 5",
  });

  console.log("\nResult:", result3.result);
  console.log("Macros used:", result3.macrosUsed);
  console.log("(Should use the previously created macro)");
}

// ///////////////////////////////////////////////////////////////////////////
// Example 5: Complex task combining macros
// ///////////////////////////////////////////////////////////////////////////

console.log("\n" + "=".repeat(60));
console.log("Example 5: Complex task combining operations");
console.log("=".repeat(60));

const result4 = await agent.execute({
  goal: "Find the maximum of the square of 3 and the double of 5",
});

console.log("\nResult:", result4.result);
console.log("Program:", JSON.stringify(result4.program, null, 2));
console.log("Macros used:", result4.macrosUsed);
console.log("Reasoning:", result4.reasoning);

// ///////////////////////////////////////////////////////////////////////////
// Example 6: Task with effects
// ///////////////////////////////////////////////////////////////////////////

console.log("\n" + "=".repeat(60));
console.log("Example 6: Task with side effects");
console.log("=".repeat(60));

const result5 = await agent.execute({
  goal: "Store the value 42 in the key 'answer', then retrieve it and double it",
});

console.log("\nResult:", result5.result);
console.log("Logs:", result5.logs);
console.log("Macros used:", result5.macrosUsed);

// ///////////////////////////////////////////////////////////////////////////
// Summary
// ///////////////////////////////////////////////////////////////////////////

console.log("\n" + "=".repeat(60));
console.log("Summary");
console.log("=".repeat(60));

const finalMacros = await agent.listMacros();
console.log(`\nTotal macros available: ${finalMacros.length}`);
console.log("Builtin macros: 6");
console.log(`Macros created in this session: ${finalMacros.length - 6}`);

console.log("\n✅ Demo completed!");
