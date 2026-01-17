# Self-Extending Agent Experiment

Build a programming standard library through task completion.

## How It Works

1. Load programming task (description + tests)
2. Search macro library for relevant tools
3. LLM generates SAJ program using found macros
4. Execute program, run tests
5. If tests pass, store as reusable macro
6. Library grows, future tasks get easier

## Components

- `agent.ts` - Agent that searches, generates, executes
- `macros.ts` - Macro storage and retrieval
- `saj-flow.ts` - LLM flow orchestration

## Running

```bash
deno run -A agent.ts
```

## What Emerges

Programming macros like:
- reverse(list)
- flatten(nested)
- groupBy(list, key)
- compose(f, g)
