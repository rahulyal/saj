import { Handlers } from "$fresh/server.ts";
import { SajProgramWithMeta } from "../../schema.ts";

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

export const handler: Handlers = {
  async POST(req) {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    try {
      const { prompt, model = "gpt-4o" } = await req.json();

      if (!prompt) {
        return Response.json(
          { error: "prompt is required" },
          { status: 400 }
        );
      }

      // Call OpenAI with structured output
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You are a SAJ program generator. SAJ is a JSON-based programming language.

${SAJ_SCHEMA_DOCS}

Generate valid SAJ programs based on user requests. Always return a JSON object with:
- "description": A brief description of what the program does
- "program": The SAJ program (a valid SAJ expression or definition)

Be creative but ensure the program is syntactically valid according to the schema.`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return Response.json(
          { error: "OpenAI API error", details: error },
          { status: response.status }
        );
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        return Response.json(
          { error: "No response from LLM" },
          { status: 500 }
        );
      }

      const generated = JSON.parse(content);

      // Validate the generated program
      const parsed = SajProgramWithMeta.safeParse(generated);
      if (!parsed.success) {
        // Return the raw generation with validation errors for debugging
        return Response.json({
          success: false,
          raw: generated,
          validationErrors: parsed.error.format(),
          meta: {
            model,
            tokens: data.usage,
          },
        });
      }

      return Response.json({
        success: true,
        description: parsed.data.description,
        program: parsed.data.program,
        meta: {
          model,
          tokens: data.usage,
        },
      });
    } catch (error) {
      return Response.json(
        { error: "Generation failed", message: (error as Error).message },
        { status: 500 }
      );
    }
  },
};
