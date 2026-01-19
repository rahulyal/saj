# SAJ Exploratory Paths

Future directions for making SAJ the best programming agent.

## Core Insight

LLMs shouldn't call predefined tools — they should write programs from primitives. Programs persist, compose, and the agent builds its own library.

---

## Implemented ✓

### Global Programs Registry
- [x] Backend endpoints for publish/list/search/get
- [x] CLI commands: `saj publish`, `saj browse`, `saj search`, `saj import`
- [x] Browse page at `/browse`
- [x] Auto-publish successful programs

### RLM (Recursive Language Model)
- [x] `llm_call` with `context_name` to reference stored contexts
- [x] `system` prompt support
- [x] `depth` tracking to prevent infinite recursion
- [x] File operations: `file_grep`, `file_stat`, `file_slice`, `glob`
- [x] Context store: `context_set`, `context_get`, `context_list`, `context_clear`
- [x] Prompt caching (65% smaller prompts)

### Language
- [x] Modulo operator `%`
- [x] Comparison operators `!=`, `<=`, `>=`
- [x] Boolean operators `and`, `or`, `not`
- [x] Windows support

---

## Future

### 1. Semantic Memory
- [ ] Embed stored programs for semantic search
- [ ] "Show me programs similar to X"
- [ ] Confidence scores based on usage/success rate

### 2. Self-Improvement Loop
- [ ] Agent writes tests for its own programs
- [ ] Detects failures, rewrites, retests automatically
- [ ] Track failure patterns, avoid repeating mistakes

### 3. Real Code Output
- [ ] SAJ as "thinking language", emit real TypeScript/Python
- [ ] `write_code` effect that generates actual project files
- [ ] Project scaffolding from natural language

### 4. Multi-Agent Swarm
- [ ] `llm_call_agent` - spawns full SAJ sub-agent
- [ ] Shared vs isolated environments
- [ ] Agent specialization via system prompts
- [ ] Cost controls: depth limit, token budget

### 5. MCP Integration
- [ ] SAJ as an MCP server
- [ ] SAJ as an MCP client
- [ ] Database connectors
- [ ] Browser automation

### 6. Planning & Backtracking
- [ ] State checkpoints before risky operations
- [ ] Rollback on failure, try alternatives
- [ ] Dependency graph for complex tasks

---

## Quick Wins
- [ ] Better error messages with suggestions
- [ ] `saj run <program>` - run stored program directly
- [ ] Program versioning

## Research Questions
- What's the minimal set of primitives needed?
- Can SAJ programs be compiled to faster representations?
- Can agents teach each other programs?

---

## References
- [RLM Paper (MIT)](https://arxiv.org/abs/2412.14093) - Recursive Language Models
- [MCP](https://modelcontextprotocol.io/) - Model Context Protocol
- [SICP](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html) - Structure and Interpretation of Computer Programs
