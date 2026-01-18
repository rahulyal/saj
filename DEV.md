# SAJ Development Guide

## Local Development

### Run CLI locally (without installing)
```bash
cd /Users/rahulyal/Documents/saj
deno run -A --env --unstable-kv saj.ts
```

### Run with Opus locally
```bash
deno run -A --env --unstable-kv saj.ts opus
```

### Run single command locally
```bash
deno run -A --env --unstable-kv saj.ts "what is 2+2"
```

### Run backend locally
```bash
cd backend
deno task dev    # with hot reload
# or
deno task start  # without hot reload
```

### Use local backend (instead of production)
```bash
export SAJ_API_URL=http://localhost:8000
deno run -A --env --unstable-kv saj.ts
```

### Use your own API key (bypass backend)
```bash
export ANTHROPIC_API_KEY=sk-ant-...
# Remove or rename ~/.saj/config.json to skip hosted auth
mv ~/.saj/config.json ~/.saj/config.json.bak
deno run -A --env --unstable-kv saj.ts
```

---

## Testing Changes

1. Make changes to `saj.ts`, `eval.ts`, `effects.ts`, or `backend/main.ts`
2. Test locally with `deno run -A --env --unstable-kv saj.ts`
3. Verify it works as expected
4. Then commit and deploy

---

## Commit & Deploy

### 1. Commit changes
```bash
git add -A
git reset HEAD .zed  # exclude editor config
git commit -m "feat: description of change"
git push
```

### 2. Deploy backend (if backend/main.ts changed)
```bash
cd backend
deno task deploy
```

### 3. Update installed CLI (to test production)
```bash
saj update
```

---

## File Structure

```
saj.ts          # Main CLI + agent loop
eval.ts         # SAJ evaluator
effects.ts      # Effect handlers (fetch, shell, llm_call)
types.ts        # Type definitions
backend/
  main.ts       # Deno Deploy backend (auth, proxy, usage, global programs)
  deno.json     # Backend config + deploy settings
```

---

## Key URLs

- Production: https://saj.recovery.deno.net
- Browse programs: https://saj.recovery.deno.net/browse
- API: https://saj.recovery.deno.net/programs

---

## Common Issues

### "Cannot find name 'Deno'" TypeScript errors
These are IDE warnings only. Deno runtime provides these globals. Code runs fine.

### Programs not persisting
KV is stored at `~/.saj/data.db`. Different between installed vs local runs if path isn't set correctly.

### Budget exceeded
Either wait for month reset, or use your own ANTHROPIC_API_KEY.
