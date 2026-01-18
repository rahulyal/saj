# SAJ - Self-Programming Agent

LLMs don't call tools. They write programs.

## The Idea

```
Traditional:  Human writes code → LLM helps
SAJ:          LLM writes programs → LLM executes → LLM remembers
```

SAJ is a minimal, Turing-complete language expressed as JSON. The agent outputs structured programs, executes them, and builds up its own library over time.

## Install

```bash
curl -fsSL https://saj.recovery.deno.net/install.sh | bash
```

Then authenticate:

```bash
saj login
```

That's it. Start chatting:

```bash
saj
```

## Usage

```
› factorial of 5
  saj 2 programs
  1. define factorial
  2. call factorial
  → 120

› factorial of 10
  → 3628800  # reuses existing definition

› list files in current directory
  saj 1 program
  1. effect:shell
  → saj.ts, eval.ts, effects.ts...

› programs
  factorial (2 uses) - Calculates factorial using recursion

› session
  context: 3.2% (6.4k/200k)
  messages: 4

› env
  factorial: #<procedure>

› clear
  cleared
```

## How It Works

The agent has ONE tool: execute SAJ programs.

```
User: "factorial of 5"
  ↓
Agent writes SAJ:
  [
    {"type":"definition","key":{"type":"variable","key":"factorial"},"value":{...}},
    {"type":"procedureCall","procedure":{"type":"variable","key":"factorial"},"arguments":[5]}
  ]
  ↓
Evaluator executes → 120
  ↓
Agent stores program for reuse
```

## SAJ Language

9 types. Turing complete.

```json
// Primitives
{"type": "number", "value": 42}
{"type": "string", "value": "hello"}
{"type": "boolean", "value": true}

// Variables
{"type": "variable", "key": "x"}

// Operations
{"type": "arithmeticOperation", "operation": "+", "operands": [...]}
{"type": "comparativeOperation", "operation": "=", "operands": [...]}

// Functions
{"type": "procedure", "inputs": ["n"], "body": <expr>}
{"type": "procedureCall", "procedure": <var>, "arguments": [...]}

// Control flow
{"type": "conditional", "condition": <expr>, "trueReturn": <expr>, "falseReturn": <expr>}

// Binding
{"type": "definition", "key": {"type":"variable","key":"name"}, "value": <expr>}

// Effects (async I/O)
{"type": "effect", "name": "fetch", "args": {"url": "..."}, "bind": "result", "then": <expr>}
```

## Effects

The agent can interact with the world:

| Effect | Description |
|--------|-------------|
| `fetch` | HTTP requests |
| `read_file` | Read files |
| `write_file` | Write files |
| `shell` | Run commands |
| `llm_call` | Recursive LLM calls |
| `get_env` | See defined procedures |
| `store_program` | Save program to library |
| `search_programs` | Find saved programs |
| `list_programs` | List all programs |
| `recall_program` | Get a saved program |

## Architecture

```
saj.ts      CLI + agent loop + memory effects
eval.ts     SAJ evaluator (async, handles effects)
effects.ts  Effect handlers (fetch, shell, llm_call, etc.)
types.ts    Type definitions
```

## Commands

```bash
saj              # Start chatting
saj login        # Authenticate via GitHub
saj logout       # Clear credentials
saj whoami       # Show current user
saj usage        # Show token usage & budget
saj update       # Update to latest version
```

## The Vision

Claude Code: LLM calls predefined tools
SAJ: LLM writes programs from primitives

The agent builds its own library. It remembers what it wrote. It gets better at serving you over time.

## License

MIT
