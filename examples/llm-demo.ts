/**
 * LLM Adapter Demo
 *
 * Demonstrates direct usage of the lightweight LLM adapter
 * for structured outputs with both OpenAI and Anthropic.
 *
 * Run with:
 *   OPENAI_API_KEY=... deno run -A examples/llm-demo.ts
 *   ANTHROPIC_API_KEY=... deno run -A examples/llm-demo.ts
 */

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import {
  openai,
  anthropic,
  fromEnv,
  isError,
  zodToJsonSchema,
} from "../lib/llm.ts";

// ///////////////////////////////////////////////////////////////////////////
// Example 1: Simple schema with auto-detected provider
// ///////////////////////////////////////////////////////////////////////////

console.log("=== Example 1: Simple Schema (auto-detect provider) ===\n");

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  occupation: z.string(),
  hobbies: z.array(z.string()),
});

// Auto-detect provider from environment
const client = fromEnv();

const personResult = await client.generate({
  schema: PersonSchema,
  schemaName: "person",
  schemaDescription: "Information about a fictional person",
  userPrompt: "Generate a fictional software engineer named Alex",
  temperature: 0.8,
});

if (isError(personResult)) {
  console.error("Error:", personResult.message);
} else {
  console.log("Generated person:", personResult.data);
  console.log("Model used:", personResult.model);
  console.log("Token usage:", personResult.usage);
}

// ///////////////////////////////////////////////////////////////////////////
// Example 2: Complex nested schema
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 2: Complex Nested Schema ===\n");

const RecipeSchema = z.object({
  title: z.string(),
  description: z.string(),
  prepTimeMinutes: z.number(),
  cookTimeMinutes: z.number(),
  servings: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  ingredients: z.array(
    z.object({
      name: z.string(),
      amount: z.string(),
      optional: z.boolean(),
    }),
  ),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
});

const recipeResult = await client.generate({
  schema: RecipeSchema,
  schemaName: "recipe",
  systemPrompt: "You are a professional chef creating recipes.",
  userPrompt:
    "Create a simple pasta dish recipe that can be made in under 30 minutes",
  temperature: 0.7,
});

if (isError(recipeResult)) {
  console.error("Error:", recipeResult.message);
} else {
  console.log("Recipe:", recipeResult.data.title);
  console.log("Difficulty:", recipeResult.data.difficulty);
  console.log(
    "Total time:",
    recipeResult.data.prepTimeMinutes + recipeResult.data.cookTimeMinutes,
    "minutes",
  );
  console.log("Ingredients:", recipeResult.data.ingredients.length);
  console.log("Steps:", recipeResult.data.steps.length);
}

// ///////////////////////////////////////////////////////////////////////////
// Example 3: Using generateWithRetry
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 3: Generate with Retry ===\n");

const CodeReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["critical", "warning", "info"]),
      line: z.number().optional(),
      description: z.string(),
      suggestion: z.string(),
    }),
  ),
  overallScore: z.number().min(1).max(10),
  approved: z.boolean(),
});

const codeToReview = `
function add(a, b) {
  return a + b
}

function divide(x, y) {
  return x / y;
}
`;

const reviewResult = await client.generateWithRetry(
  {
    schema: CodeReviewSchema,
    schemaName: "code_review",
    systemPrompt: "You are a senior code reviewer. Be thorough but fair.",
    userPrompt: `Review this JavaScript code:\n\n${codeToReview}`,
    temperature: 0.5,
  },
  2, // max attempts
);

if (isError(reviewResult)) {
  console.error("Error:", reviewResult.message);
} else {
  console.log("Review Summary:", reviewResult.data.summary);
  console.log("Score:", reviewResult.data.overallScore, "/ 10");
  console.log("Approved:", reviewResult.data.approved);
  console.log("Issues found:", reviewResult.data.issues.length);
  for (const issue of reviewResult.data.issues) {
    console.log(`  [${issue.severity}] ${issue.description}`);
  }
}

// ///////////////////////////////////////////////////////////////////////////
// Example 4: Inspect JSON Schema conversion
// ///////////////////////////////////////////////////////////////////////////

console.log("\n=== Example 4: Zod to JSON Schema Conversion ===\n");

const ComplexSchema = z.object({
  id: z.string(),
  count: z.number().int().min(0),
  status: z.enum(["pending", "active", "completed"]),
  metadata: z.record(z.string()),
  tags: z.array(z.string()).optional(),
  nested: z.object({
    flag: z.boolean(),
    value: z.number().nullable(),
  }),
});

const jsonSchema = zodToJsonSchema(ComplexSchema);
console.log("Generated JSON Schema:");
console.log(JSON.stringify(jsonSchema, null, 2));

// ///////////////////////////////////////////////////////////////////////////
// Example 5: Explicit provider selection (if both keys available)
// ///////////////////////////////////////////////////////////////////////////

const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

if (anthropicKey && openaiKey) {
  console.log("\n=== Example 5: Explicit Provider Selection ===\n");

  const SimpleSchema = z.object({
    greeting: z.string(),
    mood: z.enum(["happy", "neutral", "sad"]),
  });

  // Use OpenAI explicitly
  const openaiClient = openai(openaiKey, "gpt-4o-mini");
  const openaiResult = await openaiClient.generate({
    schema: SimpleSchema,
    schemaName: "greeting",
    userPrompt: "Generate a cheerful greeting",
  });

  if (!isError(openaiResult)) {
    console.log("OpenAI says:", openaiResult.data.greeting);
  }

  // Use Anthropic explicitly
  const anthropicClient = anthropic(anthropicKey, "claude-haiku-4-20250514");
  const anthropicResult = await anthropicClient.generate({
    schema: SimpleSchema,
    schemaName: "greeting",
    userPrompt: "Generate a cheerful greeting",
  });

  if (!isError(anthropicResult)) {
    console.log("Anthropic says:", anthropicResult.data.greeting);
  }
} else {
  console.log("\n=== Example 5: Skipped (need both API keys) ===\n");
}

console.log("\n=== All examples completed! ===\n");
