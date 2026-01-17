# Math Standard Library Experiment

Build a math standard library by solving GSM8K problems.

## How It Works

1. Load math problem (question + expected answer)
2. LLM generates SAJ program to solve it
3. Execute program, check if result matches
4. If correct, store as reusable macro
5. On new problems, search library for relevant macros

## Running

```bash
deno run -A runner.ts
```

## Observed Results

- 100% accuracy on 10 sample problems
- 92.5% accuracy on 80 problems
- LLM naturally uses let-bindings for step-by-step reasoning

## What Emerges

Math macros like:
- percentage(pct, total)
- average(list)
- area(length, width)
- discount(price, pct)
