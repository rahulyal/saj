# Research Plan: Self-Extending Math Agents via Learned Procedure Libraries

## Hypothesis

Running a self-extending agent on GSM8K will cause it to:
1. Create a library of math macros (percentage, average, area, etc.)
2. Improve accuracy over time as the library grows
3. Demonstrate macro reuse patterns (later problems benefit from earlier solutions)

## Key Research Questions

1. **Does the macro library improve accuracy?**
   - Baseline: Agent with empty library
   - Treatment: Agent with accumulated macros
   - Metric: Accuracy on held-out test set

2. **What macros emerge?**
   - Are they generalizable (e.g., "percentage") or overfitted (e.g., "solve_apple_problem")?
   - Do they compose well?

3. **Is there a curriculum effect?**
   - Does accuracy improve as the agent sees more problems?
   - Is there a "phase transition" when key macros are learned?

4. **How does this compare to baselines?**
   - vs. Direct LLM (no SAJ)
   - vs. Fixed tool library
   - vs. Chain-of-thought prompting

## Current SAJ Limitations (Must Fix)

| Limitation | Impact | Fix |
|------------|--------|-----|
| No lists/arrays | Can't express "sum of items" | Add `list` type and `map/reduce` effects |
| No recursion | Can't express factorial, fibonacci | Allow procedure self-reference |
| No string manipulation | Can't parse word problems | Add string effects |
| No variables in effects | Can't store intermediate results | Already have `let` effect |

## Proposed SAJ Extensions

### 1. List Type
```json
{
  "type": "list",
  "elements": [
    { "type": "number", "value": 1 },
    { "type": "number", "value": 2 },
    { "type": "number", "value": 3 }
  ]
}
```

### 2. List Operations
```json
{
  "type": "listOperation",
  "operation": "sum",  // | "length" | "map" | "filter" | "reduce"
  "list": { "type": "variable", "key": "numbers" }
}
```

### 3. Recursive Procedures
```json
{
  "type": "procedure",
  "name": "factorial",  // Named for self-reference
  "inputs": ["n"],
  "body": {
    "type": "conditional",
    "condition": { "type": "comparativeOperation", "operation": "=", "operands": [{"type": "variable", "key": "n"}, {"type": "number", "value": 0}] },
    "trueReturn": { "type": "number", "value": 1 },
    "falseReturn": {
      "type": "arithmeticOperation",
      "operation": "*",
      "operands": [
        { "type": "variable", "key": "n" },
        { "type": "procedureCall", "procedure": { "type": "variable", "key": "factorial" }, "arguments": [
          { "type": "arithmeticOperation", "operation": "-", "operands": [{"type": "variable", "key": "n"}, {"type": "number", "value": 1}] }
        ]}
      ]
    }
  }
}
```

## Experiment Design

### Phase 1: Baseline Measurement
1. Run vanilla GPT-4 on GSM8K (no SAJ)
2. Run SAJ agent with empty library
3. Establish baseline accuracy

### Phase 2: Library Accumulation
1. Run SAJ agent on training set (7000 problems)
2. Allow macro creation
3. Track: accuracy over time, macros created, macro reuse

### Phase 3: Evaluation
1. Freeze macro library
2. Evaluate on held-out test set (1000 problems)
3. Compare to baselines

### Phase 4: Ablations
1. Disable macro creation (use fixed library)
2. Disable macro search (always generate fresh)
3. Vary macro creation threshold

## Metrics

| Metric | Description |
|--------|-------------|
| Accuracy | % problems with correct final answer |
| Macro Creation Rate | New macros per 100 problems |
| Macro Reuse Rate | % of problems using existing macros |
| Library Size | Total macros in KV |
| Macro Quality | Success rate per macro |
| Accuracy Improvement | Δ accuracy from start to end |

## Expected Results (Hypotheses)

1. **Accuracy improves over time** - As library grows, later problems are easier
2. **Macro reuse increases** - Early problems create, later problems reuse
3. **High-quality macros emerge** - "percentage", "average", "area" have high success rates
4. **Beats direct LLM** - Structured execution + tools > raw generation

## Potential Venues

| Venue | Angle | Deadline |
|-------|-------|----------|
| NeurIPS 2025 | Neurosymbolic/Program Synthesis | May 2025 |
| ICML 2025 | Learning + Reasoning | Feb 2025 |
| ICLR 2026 | Agents/Tool Use | Sep 2025 |
| EMNLP 2025 | LLM Capabilities | Jun 2025 |
| ACL 2025 | NLP + Reasoning | Feb 2025 |

## Title Ideas

1. "Self-Extending Agents: Learning Tool Libraries through Program Synthesis"
2. "From Problems to Procedures: LLMs as Library-Building Math Agents"
3. "Macro Learning: Self-Improving Agents via Accumulated DSL Programs"
4. "Teaching LLMs to Build Their Own Tools: A DSL Approach"

## Related Work

- **DreamCoder** (Ellis et al., 2021) - Learning program libraries
- **Parsel** (Zelikman et al., 2023) - Hierarchical program synthesis
- **Toolformer** (Schick et al., 2023) - LLMs learning to use tools
- **Program-aided Language Models** (Gao et al., 2023) - Code for reasoning
- **ReAct** (Yao et al., 2022) - Reasoning + Acting

## Implementation Checklist

- [ ] Extend SAJ with lists and list operations
- [ ] Add recursion support
- [ ] Implement GSM8K data loader
- [ ] Build training loop with checkpointing
- [ ] Add embedding-based macro search
- [ ] Create visualization for accuracy curves
- [ ] Run baseline experiments
- [ ] Run full training
- [ ] Analyze emergent macros
- [ ] Write paper draft
