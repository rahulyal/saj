# Scheme As Javascript (SAJ)

A JSON-based programming language with LLM integration for program generation.

## Requirements

- [Deno](https://docs.deno.com/runtime/getting_started/installation/) runtime

## Quick Start

### REPL

Run the SAJ REPL:

```bash
deno task repl
```

### Development Server

Start the Fresh development server:

```bash
deno task dev
```

### Run Examples

```bash
# Evaluator demo (no API key needed)
deno run -A examples/eval-demo.ts

# LLM-powered generation (requires API key)
OPENAI_API_KEY=... deno run -A examples/flow-demo.ts
# or
ANTHROPIC_API_KEY=... deno run -A examples/flow-demo.ts

# Direct LLM adapter usage
OPENAI_API_KEY=... deno run -A examples/llm-demo.ts
```

## LLM Integration

SAJ includes a lightweight, Deno Deploy-native LLM adapter for structured outputs. No heavy dependencies - just native `fetch`.

### Supported Providers

- **OpenAI** (GPT-4o, GPT-4o-mini, etc.) - Uses JSON Schema response format
- **Anthropic** (Claude Sonnet, Claude Haiku, etc.) - Uses tool_use pattern

### Basic Usage

```typescript
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { openai, anthropic, fromEnv, isError } from "./lib/llm.ts";

// Define your schema with Zod
const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  occupation: z.string(),
});

// Auto-detect provider from environment (checks ANTHROPIC_API_KEY, then OPENAI_API_KEY)
const client = fromEnv();

// Or explicitly create a client
// const client = openai(Deno.env.get("OPENAI_API_KEY")!);
// const client = anthropic(Deno.env.get("ANTHROPIC_API_KEY")!);

const result = await client.generate({
  schema: PersonSchema,
  schemaName: "person",
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Generate a fictional software engineer",
  temperature: 0.7,
});

if (isError(result)) {
  console.error(result.message);
} else {
  console.log(result.data); // Typed as { name: string, age: number, occupation: string }
}
```

### SAJ Program Generation

Generate SAJ programs from natural language:

```typescript
import { createGenerateAndRunFlow } from "./lib/saj-flow.ts";

// Auto-detects provider from environment
const flow = createGenerateAndRunFlow();

const result = await flow({
  prompt: "Calculate the factorial of 5",
});

console.log(result.program);  // The generated SAJ program
console.log(result.result);   // The execution result (120)
```

### API Endpoints

The Fresh server exposes these endpoints:

- `POST /api/generate` - Generate SAJ programs from natural language
- `POST /api/run` - Execute SAJ programs

```bash
# Generate a program
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Add 2 and 3"}'

# Run a program
curl -X POST http://localhost:8000/api/run \
  -H "Content-Type: application/json" \
  -d '{"program": {"type": "arithmeticOperation", "operation": "+", "operands": [{"type": "number", "value": 2}, {"type": "number", "value": 3}]}}'
```

## SAJ Language Reference

SAJ programs are JSON objects with a `type` field:

### Primitives

```json
{ "type": "number", "value": 42 }
{ "type": "string", "value": "hello" }
{ "type": "boolean", "value": true }
```

### Variables

```json
{ "type": "variable", "key": "x" }
```

### Arithmetic Operations

```json
{
  "type": "arithmeticOperation",
  "operation": "+",
  "operands": [
    { "type": "number", "value": 10 },
    { "type": "number", "value": 20 }
  ]
}
```

Operations: `+`, `-`, `*`, `/`

### Comparative Operations

```json
{
  "type": "comparativeOperation",
  "operation": ">",
  "operands": [
    { "type": "number", "value": 100 },
    { "type": "number", "value": 50 }
  ]
}
```

Operations: `>`, `<`, `=`, `>=`, `<=`, `!=`

### Conditionals

```json
{
  "type": "conditional",
  "condition": { "type": "boolean", "value": true },
  "trueReturn": { "type": "string", "value": "yes" },
  "falseReturn": { "type": "string", "value": "no" }
}
```

### Procedures (Lambdas)

```json
{
  "type": "procedure",
  "inputs": ["x"],
  "body": {
    "type": "arithmeticOperation",
    "operation": "*",
    "operands": [
      { "type": "variable", "key": "x" },
      { "type": "variable", "key": "x" }
    ]
  }
}
```

### Procedure Calls

```json
{
  "type": "procedureCall",
  "procedure": { "type": "variable", "key": "square" },
  "arguments": [{ "type": "number", "value": 5 }]
}
```

### Effects

SAJ supports side effects through effect expressions:

```json
{ "type": "effect", "action": "kv:get", "key": "mykey" }
{ "type": "effect", "action": "kv:set", "key": "mykey", "value": { "type": "number", "value": 42 } }
{ "type": "effect", "action": "log", "message": { "type": "string", "value": "Hello!" } }
{ "type": "effect", "action": "fetch", "url": "https://api.example.com", "method": "GET" }
```

## Project Structure

```
saj/
├── lib/
│   ├── llm.ts          # Lightweight LLM adapter for structured outputs
│   ├── saj-flow.ts     # LLM-powered SAJ generation flows
│   └── mod.ts          # Library entry point
├── routes/
│   └── api/
│       ├── generate.ts # SAJ generation endpoint
│       └── run.ts      # SAJ execution endpoint
├── examples/
│   ├── eval-demo.ts    # Evaluator demonstration
│   ├── flow-demo.ts    # LLM flow demonstration
│   └── llm-demo.ts     # Direct LLM adapter usage
├── evaluator.ts        # SAJ program evaluator (TypeScript, async)
├── schema.ts           # Zod schemas for SAJ programs
├── saj.js              # REPL implementation
├── parser.js           # SAJ parser
├── tokenizer.js        # SAJ tokenizer
└── types.js            # Type validation
```

## Environment Variables

- `OPENAI_API_KEY` - OpenAI API key for GPT models
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude models

When deploying to Deno Deploy, the KV store is automatically used for persistence.

## License

MIT