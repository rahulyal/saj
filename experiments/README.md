# SAJ Experiments

Explorations using SAJ as a self-extending language.

## Core Idea

```
Task → LLM writes SAJ → Run → Verify → Store if good → Library grows
```

SAJ is a minimal Turing-complete JSON language. AI builds standard libraries on top through verified execution.

## Experiments

### math-stdlib/

Build math standard library via GSM8K problems.

- **Verification**: `result === expected_answer`
- **Output**: Math macros (percentage, average, area, etc.)
- **Status**: 92.5% accuracy on 80 problems observed

### self-extending-agent/

Build programming standard library via coding tasks.

- **Verification**: Tests pass
- **Output**: Programming macros (utilities, transforms, etc.)
- **Status**: Framework ready

## Running

```bash
deno run -A experiments/math-stdlib/runner.ts
deno run -A experiments/self-extending-agent/agent.ts
```

## What Emerges

Each experiment produces macros - JSON programs that solved real problems and can be reused.
