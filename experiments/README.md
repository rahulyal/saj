# SAJ Experiments

Research experiments exploring self-extending agents and LLM-powered program synthesis.

## GSM8K Training (`gsm8k-training.ts`)

Tests the hypothesis that running a self-extending agent on math problems will cause it to:
1. Create a library of reusable math macros (percentage, average, area, etc.)
2. Improve accuracy over time as the library grows
3. Demonstrate macro reuse patterns

### Running

```bash
deno run -A experiments/gsm8k-training.ts
```

### Results (Observed)
- 100% accuracy on 10 sample problems with gpt-5-nano
- 92.5% accuracy on 80 problems
- LLM naturally uses `let`-bindings for step-by-step reasoning

### Key Insight
The LLM doesn't just output final answers - it generates structured programs with intermediate variable bindings, enabling transparent reasoning and debugging.

## Research Plan (`RESEARCH_PLAN.md`)

Detailed research plan for a potential paper on self-extending agents via learned procedure libraries.

### Key Questions
1. Does the macro library improve accuracy over time?
2. What macros emerge (generalizable vs overfitted)?
3. Is there a curriculum effect?
4. How does this compare to baselines?

## Future Experiments

Ideas for future research:
- Embedding-based macro search
- Macro composition and chaining
- Transfer learning across domains
- Ablation studies on macro creation threshold
