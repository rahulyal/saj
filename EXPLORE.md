# SAJ Exploratory Paths

Future directions for making SAJ the best programming agent.

## Core Insight

LLMs shouldn't call predefined tools — they should write programs from primitives. Programs persist, compose, and the agent builds its own library.

---

## 0. Global Programs Registry (DONE)

- [x] Backend endpoints for publish/list/search/get
- [x] CLI commands: `saj publish`, `saj browse`, `saj search`, `saj import`
- [x] Browse page at `/browse`
- [ ] Upvoting/rating system
- [ ] Program versioning

## 1. Semantic Memory

- [ ] Embed stored programs for semantic search
- [ ] Auto-store successful programs
- [ ] "Show me programs similar to X"
- [ ] Learn which programs work for which tasks
- [ ] Confidence scores based on usage/success rate

## 2. Self-Improvement Loop

- [ ] Agent writes tests for its own programs
- [ ] Detects failures, rewrites, retests automatically
- [ ] Builds confidence scores for programs
- [ ] Track failure patterns, avoid repeating mistakes
- [ ] Opus-level reasoning as default for complex tasks

## 3. Real Code Output

- [ ] SAJ as "thinking language", emit real TypeScript/Python
- [ ] `effect:write_code` that generates actual project files
- [ ] Bootstrap from SAJ primitives to real codebases
- [ ] Project scaffolding from natural language
- [ ] Refactoring via SAJ programs

## 4. Multi-Agent Swarm

- [ ] `llm_call` spawns sub-agents with isolated SAJ envs
- [ ] Parent can pass programs to children
- [ ] Parallel execution of subtasks
- [ ] Shared program library across agents
- [ ] Agent specialization (researcher, coder, tester)

## 5. MCP Integration

- [ ] SAJ as an MCP server
- [ ] SAJ as an MCP client (connect to other servers)
- [ ] Database connectors
- [ ] Browser automation
- [ ] Universal agent backbone

## 6. Planning & Backtracking

- [ ] Multi-step goal decomposition
- [ ] State checkpoints before risky operations
- [ ] Rollback on failure, try alternatives
- [ ] Dependency graph for complex tasks
- [ ] "Think ahead" mode with plan visualization

## 7. Observability

- [ ] Visualize program execution (AST tree)
- [ ] Step-through debugging mode
- [ ] "Explain what you're doing" mode
- [ ] Execution traces for debugging
- [ ] Performance profiling (token usage per program)

---

## Quick Wins (Low Effort, High Impact)

- [x] Windows support (PowerShell installer, cross-platform paths)
- [ ] Better error messages with suggestions
- [ ] `saj run <program>` - run stored program directly
- [ ] `saj export` - export programs as JSON/TypeScript
- [ ] `saj import` - import programs from file
- [ ] Program versioning (keep history)

## Research Questions

- How to balance SAJ complexity vs LLM token usage?
- Can SAJ programs be compiled to faster representations?
- What's the minimal set of primitives needed?
- How to handle long-running tasks (persistence across sessions)?
- Can agents teach each other programs?

---

## References

- [RLM Paper (MIT)](https://arxiv.org/abs/2310.09821) - Recursive Language Models
- [MCP](https://modelcontextprotocol.io/) - Model Context Protocol
- [SICP](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html) - Structure and Interpretation of Computer Programs
