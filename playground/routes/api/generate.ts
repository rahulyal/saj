import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import { SajProgramWithMeta } from "../../../core/schema.ts";
import { createLLMClient, fromEnv, isError } from "../../../lib/llm.ts";

// SAJ schema documentation for the LLM
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
- Operands can be numbers, variables, nested operations, procedure calls, conditionals, or effects

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

## Example: Fetch and store
{
  "type": "effect",
  "action": "sequence",
  "steps": [
    {
      "type": "effect",
      "action": "let",
      "binding": "data",
      "value": { "type": "effect", "action": "fetch", "url": "https://api.example.com/data", "method": "GET" },
      "body": {
        "type": "effect",
        "action": "kv:set",
        "key": "cached_data",
        "value": { "type": "variable", "key": "data" }
      }
    }
  ]
}
`;

const RequestSchema = z.object({
  prompt: z.string().min(1),
  provider: z.enum(["openai", "anthropic"]).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const handler: Handlers = {
  async POST(req) {
    try {
      const body = await req.json();

      // Validate request
      const parsed = RequestSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid request", details: parsed.error.format() },
          { status: 400 },
        );
      }

      const { prompt, provider, model, temperature } = parsed.data;

      // Create LLM client - either from explicit provider or auto-detect from env
      let client;
      try {
        if (provider) {
          const apiKey =
            provider === "anthropic"
              ? Deno.env.get("ANTHROPIC_API_KEY")
              : Deno.env.get("OPENAI_API_KEY");

          if (!apiKey) {
            return Response.json(
              { error: `${provider.toUpperCase()}_API_KEY not configured` },
              { status: 500 },
            );
          }

          client = createLLMClient({
            provider,
            apiKey,
            model,
          });
        } else {
          // Auto-detect from environment
          client = fromEnv();
        }
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }

      const systemPrompt = `You are a SAJ program generator. SAJ is a JSON-based programming language.

${SAJ_SCHEMA_DOCS}

Generate valid SAJ programs based on user requests. Be creative but ensure the program is syntactically valid according to the schema.

IMPORTANT: Always respond with a JSON object containing exactly these two fields:
- "description": A brief description of what the program does
- "program": The SAJ program (a valid SAJ expression)

Example response format:
{
  "description": "Adds two numbers",
  "program": {
    "type": "arithmeticOperation",
    "operation": "+",
    "operands": [
      { "type": "number", "value": 2 },
      { "type": "number", "value": 3 }
    ]
  }
}`;

      const startTime = performance.now();

      const result = await client.generateWithRetry({
        schema: SajProgramWithMeta,
        schemaName: "saj_program",
        schemaDescription:
          "A SAJ program with a description of what it does and the program itself",
        systemPrompt,
        userPrompt: prompt,
        temperature: temperature ?? 0.7,
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (isError(result)) {
        // Return structured error response
        return Response.json(
          {
            success: false,
            error: result.type,
            message: result.message,
            raw: result.raw,
            meta: { durationMs },
          },
          { status: result.status ?? 500 },
        );
      }

      return Response.json({
        success: true,
        description: result.data.description,
        program: result.data.program,
        meta: {
          model: result.model,
          durationMs,
          tokens: result.usage,
        },
      });
    } catch (error) {
      return Response.json(
        { error: "Generation failed", message: (error as Error).message },
        { status: 500 },
      );
    }
  },
};
