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
- [x] Auto-publish successful programs (global dataset)
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

## 4. Recursive Language Model (RLM) Patterns

Inspired by [MIT's RLM paper](https://arxiv.org/abs/2512.24601) — LLMs that call themselves on sub-problems.

**Core idea**: Instead of forcing one LLM call to process everything, let the LLM call itself recursively. Context becomes a variable that sub-calls can reference.

### Text Effects (chunking primitives) ✓
- [x] `text_slice` - substring extraction
- [x] `text_chunk` - split text into array of chunks
- [x] `text_grep` - filter lines by pattern
- [x] `text_length` - count characters/lines
- [x] `text_lines` - split text into lines array
- [x] `text_join` - join array with separator

### File Operations (performant) ✓
- [x] `file_grep` - search file by pattern without loading all content
- [x] `file_stat` - get file stats (size, lines, modified)
- [x] `file_slice` - read specific line range
- [x] `glob` - find files matching pattern

### Context Store (shared state for sub-calls) ✓
- [x] `context_set` - store large text by name (session-scoped)
- [x] `context_get` - retrieve stored context
- [x] `context_list` - list all stored contexts
- [x] `context_clear` - clear context(s)
- [x] `llm_call` accepts `context_name` arg, auto-injects stored text

### Enhanced llm_call ✓
- [x] `system` prompt support
- [x] `depth` tracking to prevent infinite recursion
- [x] `context_name` to reference stored contexts
- [x] Auto-store large results (>5000 chars) to context store

### Parallel Execution
- [ ] `parallel` effect type - run multiple effects concurrently
- [ ] `map_llm` - map llm_call over array of chunks

### What This Enables
- Process files larger than context window (chunk → map → reduce)
- Codebase-wide analysis with shared context
- Research tasks: fetch multiple sources, synthesize
- Self-verification loops

**Key insight**: SAJ becomes "Claude Code that builds itself" — same capabilities, but programs persist and accumulate.

## 5. Multi-Agent Swarm

- [ ] `llm_call_agent` effect - spawns full SAJ sub-agent (not just raw LLM)
- [ ] Sub-agents can read/write files, run shell, call APIs
- [ ] Turtles all the way down - sub-agents can spawn sub-agents
- [ ] Shared vs isolated environments (procedures, context store)
- [ ] Agent specialization via different system prompts
- [ ] Cost controls: depth limit, token budget, time limit
- [ ] Parallel execution of subtasks
- [ ] Shared program library across agents

## 6. MCP Integration

- [ ] SAJ as an MCP server
- [ ] SAJ as an MCP client (connect to other servers)
- [ ] Database connectors
- [ ] Browser automation
- [ ] Universal agent backbone

## 7. Planning & Backtracking

- [ ] Multi-step goal decomposition
- [ ] State checkpoints before risky operations
- [ ] Rollback on failure, try alternatives
- [ ] Dependency graph for complex tasks
- [ ] "Think ahead" mode with plan visualization

## 8. Observability

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

- [RLM Paper (MIT)](https://arxiv.org/abs/2512.24601) - Recursive Language Models
- [MCP](https://modelcontextprotocol.io/) - Model Context Protocol
- [SICP](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html) - Structure and Interpretation of Computer Programs
