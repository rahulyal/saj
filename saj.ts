#!/usr/bin/env -S deno run -A --env --unstable-kv

/**
 * SAJ - Self-Programming Agent
 *
 * LLMs don't call tools. They write programs.
 * Programs execute, persist, and compose.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.52.0";
import { executeSequence, printValue } from "./eval.ts";
import { createEffectHandler, type EffectHandler } from "./effects.ts";
import type {
  SajProgram,
  Environment,
  Definition,
  Effect,
  ProcedureCall,
  ArithmeticOperation,
} from "./types.ts";

// =============================================================================
// Config
// =============================================================================

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;
const CONTEXT_WINDOW = 200000;
const CONTEXT_WARNING_THRESHOLD = 0.75; // warn at 75%
const CONTEXT_CRITICAL_THRESHOLD = 0.9; // critical at 90%

// Backend config
const SAJ_API_URL =
  Deno.env.get("SAJ_API_URL") || "https://saj.recovery.deno.net";
const CONFIG_DIR = `${Deno.env.get("HOME")}/.saj`;
const CONFIG_FILE = `${CONFIG_DIR}/config.json`;

// =============================================================================
// Credentials Management
// =============================================================================

interface SajConfig {
  token?: string;
  username?: string;
  apiUrl?: string;
}

async function loadConfig(): Promise<SajConfig> {
  try {
    const text = await Deno.readTextFile(CONFIG_FILE);
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function saveConfig(config: SajConfig): Promise<void> {
  try {
    await Deno.mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    /* exists */
  }
  await Deno.writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function getToken(): Promise<string | null> {
  // Check env first
  const envToken = Deno.env.get("SAJ_TOKEN");
  if (envToken) return envToken;

  // Check config file
  const config = await loadConfig();
  return config.token || null;
}

// =============================================================================
// Backend API Client
// =============================================================================

class SajApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async createMessage(params: {
    model: string;
    max_tokens: number;
    system: string;
    tools: Anthropic.Tool[];
    messages: Anthropic.MessageParam[];
  }): Promise<Anthropic.Message> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `API error: ${response.status}`);
    }

    return response.json();
  }

  get messages() {
    return { create: this.createMessage.bind(this) };
  }
}

type ApiClient = Anthropic | SajApiClient;

// =============================================================================
// Colors
// =============================================================================

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const $ = {
  bold: (s: string) => `${c.bold}${s}${c.reset}`,
  dim: (s: string) => `${c.dim}${s}${c.reset}`,
  red: (s: string) => `${c.red}${s}${c.reset}`,
  green: (s: string) => `${c.green}${s}${c.reset}`,
  yellow: (s: string) => `${c.yellow}${s}${c.reset}`,
  blue: (s: string) => `${c.blue}${s}${c.reset}`,
  magenta: (s: string) => `${c.magenta}${s}${c.reset}`,
  cyan: (s: string) => `${c.cyan}${s}${c.reset}`,
};

// =============================================================================
// Deno KV - Program Memory
// =============================================================================

const kv = await Deno.openKv();

interface StoredProgram {
  id: string;
  name: string;
  description: string;
  program: SajProgram[];
  createdAt: string;
  useCount: number;
  tags: string[];
}

interface Session {
  id: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  messageCount: number;
  createdAt: string;
  summary?: string;
}

async function storeProgram(
  name: string,
  description: string,
  program: SajProgram[],
  tags: string[] = [],
): Promise<StoredProgram> {
  const id = crypto.randomUUID();
  const stored: StoredProgram = {
    id,
    name,
    description,
    program,
    createdAt: new Date().toISOString(),
    useCount: 0,
    tags,
  };
  await kv.set(["programs", id], stored);
  await kv.set(["programs_by_name", name], id);
  return stored;
}

async function searchPrograms(query: string): Promise<StoredProgram[]> {
  const results: StoredProgram[] = [];
  const queryLower = query.toLowerCase();

  const iter = kv.list<StoredProgram>({ prefix: ["programs"] });
  for await (const entry of iter) {
    if (entry.key[0] === "programs_by_name") continue;
    const prog = entry.value;
    if (
      prog.name.toLowerCase().includes(queryLower) ||
      prog.description.toLowerCase().includes(queryLower) ||
      prog.tags.some((t: string) => t.toLowerCase().includes(queryLower))
    ) {
      results.push(prog);
    }
  }

  return results.sort((a, b) => b.useCount - a.useCount);
}

async function listPrograms(): Promise<StoredProgram[]> {
  const programs: StoredProgram[] = [];
  const iter = kv.list<StoredProgram>({ prefix: ["programs"] });
  for await (const entry of iter) {
    if (entry.key[0] === "programs_by_name") continue;
    programs.push(entry.value);
  }
  return programs.sort((a, b) => b.useCount - a.useCount);
}

async function getProgram(nameOrId: string): Promise<StoredProgram | null> {
  // Try by name first
  const idResult = await kv.get<string>(["programs_by_name", nameOrId]);
  if (idResult.value) {
    const prog = await kv.get<StoredProgram>(["programs", idResult.value]);
    if (prog.value) {
      // Increment use count
      prog.value.useCount++;
      await kv.set(["programs", prog.value.id], prog.value);
      return prog.value;
    }
  }

  // Try by ID
  const prog = await kv.get<StoredProgram>(["programs", nameOrId]);
  if (prog.value) {
    prog.value.useCount++;
    await kv.set(["programs", prog.value.id], prog.value);
    return prog.value;
  }

  return null;
}

async function loadSession(): Promise<Session> {
  const result = await kv.get<Session>(["session", "current"]);
  if (result.value) return result.value;

  const session: Session = {
    id: crypto.randomUUID(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    messageCount: 0,
    createdAt: new Date().toISOString(),
  };
  await kv.set(["session", "current"], session);
  return session;
}

async function updateSession(session: Session): Promise<void> {
  await kv.set(["session", "current"], session);
}

async function resetSession(summary?: string): Promise<Session> {
  const session: Session = {
    id: crypto.randomUUID(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    messageCount: 0,
    createdAt: new Date().toISOString(),
    summary,
  };
  await kv.set(["session", "current"], session);
  return session;
}

async function loadEnv(): Promise<Environment> {
  const result = await kv.get<Environment>(["env", "current"]);
  return result.value || {};
}

async function saveEnv(env: Environment): Promise<void> {
  await kv.set(["env", "current"], env);
}

// =============================================================================
// Memory Effects - Agent can store/search its own programs
// =============================================================================

function createMemoryEffects(
  getEnv: () => Environment,
): Record<string, EffectHandler> {
  return {
    get_env: (_args, _ctx) => {
      const env = getEnv();
      const keys = Object.keys(env);
      return Promise.resolve(keys.length > 0 ? keys : "empty");
    },

    store_program: async (args, _ctx) => {
      const name = args.name as string;
      const description = args.description as string;
      const program = args.program as SajProgram[];
      const tags = (args.tags as string[]) || [];

      const stored = await storeProgram(name, description, program, tags);
      return { stored: true, id: stored.id, name: stored.name };
    },

    search_programs: async (args, _ctx) => {
      const query = args.query as string;
      const results = await searchPrograms(query);
      return results.map((p) => ({
        name: p.name,
        description: p.description,
        tags: p.tags,
        useCount: p.useCount,
      }));
    },

    list_programs: async (_args, _ctx) => {
      const programs = await listPrograms();
      return programs.map((p) => ({
        name: p.name,
        description: p.description,
        tags: p.tags,
        useCount: p.useCount,
      }));
    },

    recall_program: async (args, _ctx) => {
      const name = args.name as string;
      const prog = await getProgram(name);
      if (!prog) return { error: `Program "${name}" not found` };
      return { program: prog.program, description: prog.description };
    },
  };
}

// =============================================================================
// The One Tool: SAJ Execution
// =============================================================================

const SAJ_TOOL: Anthropic.Tool = {
  name: "saj",
  description: `Execute SAJ programs. You WRITE programs, you don't call predefined tools.

TYPES:
{"type":"number","value":42}
{"type":"string","value":"hello"}
{"type":"boolean","value":true}
{"type":"variable","key":"x"}
{"type":"arithmeticOperation","operation":"+"|"-"|"*"|"/","operands":[...]}
{"type":"comparativeOperation","operation":"<"|"="|">","operands":[...]}
{"type":"procedure","inputs":["x"],"body":<expr>}
{"type":"procedureCall","procedure":<var>,"arguments":[...]}
{"type":"conditional","condition":<expr>,"trueReturn":<expr>,"falseReturn":<expr>}
{"type":"definition","key":{"type":"variable","key":"name"},"value":<expr>}

EFFECTS (I/O):
{"type":"effect","name":"<effect>","args":{...},"bind":"var","then":<expr>}

Available effects:
- fetch: {"args":{"url":"..."}} - HTTP GET
- read_file: {"args":{"path":"..."}} - read file
- write_file: {"args":{"path":"...","content":"..."}} - write file
- shell: {"args":{"cmd":"...","args":[...]}} - run command
- llm_call: {"args":{"prompt":"...","expect":"text|number|json"}} - recursive LLM
- get_env: {"args":{}} - SEE what's already defined in current session
- store_program: {"args":{"name":"...","description":"...","program":[...],"tags":[...]}} - SAVE for later
- search_programs: {"args":{"query":"..."}} - FIND your saved programs
- list_programs: {"args":{}} - LIST all your programs
- recall_program: {"args":{"name":"..."}} - GET a saved program to run

PATTERNS:
- Return effect result: "bind":"x","then":{"type":"variable","key":"x"}
- Chain effects: "then":{"type":"effect",...}
- Recursion: define procedure first, then call it

You build your own library. Store programs you might reuse. Search before writing from scratch.`,
  input_schema: {
    type: "object" as const,
    properties: {
      programs: {
        type: "array",
        items: { type: "object" },
        description: "SAJ programs to execute in sequence",
      },
    },
    required: ["programs"],
  },
};

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM = `You are SAJ - a self-programming agent.

You don't call predefined tools. You WRITE programs in SAJ (Scheme As JSON) and execute them.

## Your Capabilities
- Compute: arithmetic, logic, recursion, conditionals
- Act: fetch URLs, read/write files, run shell commands
- Think: call yourself recursively with llm_call for complex reasoning
- Remember: store programs you write, search and recall them later

## Your Workflow
1. When asked to do something, WRITE a SAJ program
2. Execute it with the saj tool
3. If it's reusable, STORE it with store_program effect
4. Next time, SEARCH your programs before writing from scratch

## Key Insight
You're not a chatbot. You're a computation engine that programs itself.
Every action = a program. Programs persist. You get better over time.

## Environment Persists!
Procedures you define stay in the environment across interactions.
Before re-defining something, use get_env to check if it already exists.
If factorial is already defined, just CALL it - don't redefine.

## Memory Effects
- store_program: Save a program for later (name, description, program, tags)
- search_programs: Find programs by query
- list_programs: See all your programs
- recall_program: Get a program to execute again

When you store a program, give it a clear name and description. Tag it well.
When asked to do something you've done before, recall and reuse.

Be concise. Write clean programs. Build your library.`;

// =============================================================================
// UI Helpers
// =============================================================================

function printLogo(): void {
  console.log();
  console.log($.magenta("      ██╗"));
  console.log($.magenta("     ██╔╝    ") + $.bold("saj"));
  console.log($.magenta("    ██╔╝     ") + $.dim("self-programming agent"));
  console.log($.magenta("   ██╔╝"));
  console.log(
    $.magenta("  ███╔╝      ") + $.dim("exit · clear · programs · session"),
  );
  console.log($.magenta(" ██╔██╗"));
  console.log($.magenta("██╔╝ ██╗"));
  console.log($.magenta("╚═╝  ╚═╝"));
  console.log();
}

function printSession(session: Session): void {
  const totalTokens = session.totalInputTokens + session.totalOutputTokens;
  const usage = totalTokens / CONTEXT_WINDOW;
  const usagePercent = (usage * 100).toFixed(1);

  let color = $.dim;
  if (usage >= CONTEXT_CRITICAL_THRESHOLD) color = $.red;
  else if (usage >= CONTEXT_WARNING_THRESHOLD) color = $.yellow;

  console.log();
  console.log($.dim("─".repeat(50)));
  console.log(
    color(
      `  context: ${usagePercent}% (${formatTokens(totalTokens)}/${formatTokens(CONTEXT_WINDOW)})`,
    ),
  );
  console.log(
    $.dim(
      `  messages: ${session.messageCount} · session: ${session.id.slice(0, 8)}`,
    ),
  );
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTime(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

// Spinner for thinking
const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let frameIdx = 0;
let spinnerInterval: number | null = null;
let spinnerText = "";

function spin(text: string): void {
  spinnerText = text;
  frameIdx = 0;
  if (!Deno.stdout.isTerminal()) return;

  const render = () => {
    const f = frames[frameIdx++ % frames.length];
    Deno.stdout.writeSync(
      new TextEncoder().encode(`\r${$.cyan(f)} ${$.dim(spinnerText)}   `),
    );
  };
  render();
  spinnerInterval = setInterval(render, 80);
}

function stopSpin(final?: string): void {
  if (spinnerInterval) clearInterval(spinnerInterval);
  spinnerInterval = null;
  if (Deno.stdout.isTerminal()) {
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
  }
  if (final) console.log(`${$.green("✓")} ${$.dim(final)}`);
}

// =============================================================================
// Agent Loop
// =============================================================================

async function run(
  client: ApiClient,
  prompt: string,
  session: Session,
  env: Environment,
  messages: Anthropic.MessageParam[],
): Promise<{ env: Environment; messages: Anthropic.MessageParam[] }> {
  // Check context usage
  const usage =
    (session.totalInputTokens + session.totalOutputTokens) / CONTEXT_WINDOW;
  if (usage >= CONTEXT_CRITICAL_THRESHOLD) {
    console.log();
    console.log(
      $.yellow(
        "  ⚠ Context nearly full. Consider: clear (reset) or continue (auto-summarize)",
      ),
    );
  }

  // Add user message
  messages.push({ role: "user", content: prompt });
  session.messageCount++;

  let currentEnv = env;

  // Setup effect handler with memory effects (closure over currentEnv)
  const memoryEffects = createMemoryEffects(() => currentEnv);
  const effectHandler = createEffectHandler({
    anthropicClient: client instanceof Anthropic ? client : undefined,
    model: MODEL,
    customHandlers: memoryEffects,
  });
  let iterations = 0;
  const MAX_ITERATIONS = 20;
  const startTime = Date.now();

  while (iterations++ < MAX_ITERATIONS) {
    spin(`thinking${iterations > 1 ? ` (${iterations})` : ""}...`);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: session.summary
        ? `${SYSTEM}\n\nPrevious context summary: ${session.summary}`
        : SYSTEM,
      tools: [SAJ_TOOL],
      messages,
    });

    session.totalInputTokens += response.usage.input_tokens;
    session.totalOutputTokens += response.usage.output_tokens;
    await updateSession(session);

    stopSpin(`${response.usage.output_tokens} tokens`);

    // Process response
    const toolUses: Anthropic.ToolUseBlock[] = [];
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolUses.push(block);
      }
    }

    if (textParts.length > 0) {
      console.log();
      for (const text of textParts) {
        console.log(`  ${text}`);
      }
    }

    messages.push({ role: "assistant", content: response.content });

    if (toolUses.length === 0) break;

    // Execute SAJ programs
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      const input = toolUse.input as { programs: SajProgram[] };
      const programs = input.programs;

      console.log();
      console.log(
        `  ${$.cyan("saj")} ${$.dim(`${programs.length} program${programs.length > 1 ? "s" : ""}`)}`,
      );

      // Show what's being executed
      for (let i = 0; i < Math.min(programs.length, 3); i++) {
        const p = programs[i];
        const desc = describeProgram(p);
        console.log(`  ${$.dim(`${i + 1}.`)} ${$.yellow(desc)}`);
      }
      if (programs.length > 3) {
        console.log(`  ${$.dim(`... +${programs.length - 3} more`)}`);
      }

      spin("executing...");
      const execStart = Date.now();

      let resultStr: string;
      try {
        const { results, env: newEnv } = await executeSequence(
          programs,
          currentEnv,
          effectHandler,
        );
        currentEnv = newEnv;
        const lastResult = results[results.length - 1];
        resultStr = printValue(lastResult);
      } catch (e) {
        resultStr = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }

      stopSpin(formatTime(Date.now() - execStart));

      // Show result
      const display =
        resultStr.length > 100 ? resultStr.slice(0, 97) + "..." : resultStr;
      console.log(`  ${$.green("→")} ${display}`);

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: resultStr,
      });
    }

    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason === "end_turn") break;
  }

  // Warn if iteration limit hit
  if (iterations >= MAX_ITERATIONS) {
    console.log();
    console.log(
      $.yellow(
        `  ⚠ Stopped: hit ${MAX_ITERATIONS} iteration limit (possible infinite loop)`,
      ),
    );
  }

  // Save environment
  await saveEnv(currentEnv);

  // Print session info
  console.log();
  console.log($.dim("─".repeat(50)));
  console.log(
    $.dim(
      `  ${formatTime(Date.now() - startTime)} · ${session.totalInputTokens}↑ ${session.totalOutputTokens}↓`,
    ),
  );

  return { env: currentEnv, messages };
}

function describeProgram(p: SajProgram): string {
  switch (p.type) {
    case "definition":
      return `define ${(p as Definition).key?.key || "?"}`;
    case "effect":
      return `effect:${(p as Effect).name}`;
    case "procedureCall": {
      const proc = (p as ProcedureCall).procedure;
      return `call ${"key" in proc ? proc.key : "λ"}`;
    }
    case "arithmeticOperation":
      return `math:${(p as ArithmeticOperation).operation}`;
    case "conditional":
      return "conditional";
    default:
      return p.type;
  }
}

// =============================================================================
// REPL
// =============================================================================

async function repl(client: ApiClient): Promise<void> {
  printLogo();

  let session = await loadSession();
  let env = await loadEnv();
  let messages: Anthropic.MessageParam[] = [];

  // Show session status on start
  if (session.messageCount > 0) {
    const usage = (
      ((session.totalInputTokens + session.totalOutputTokens) /
        CONTEXT_WINDOW) *
      100
    ).toFixed(1);
    console.log(
      $.dim(
        `  resuming session (${usage}% context, ${session.messageCount} messages)`,
      ),
    );
    console.log();
  }

  const decoder = new TextDecoder();
  const buf = new Uint8Array(4096);

  while (true) {
    Deno.stdout.writeSync(new TextEncoder().encode($.magenta("λ ")));

    const n = await Deno.stdin.read(buf);
    if (n === null) break;

    const input = decoder.decode(buf.subarray(0, n)).trim();
    if (!input) continue;

    // Commands
    if (input === "exit" || input === "quit") {
      console.log($.dim("  bye"));
      break;
    }

    if (input === "clear") {
      session = await resetSession();
      env = {};
      await saveEnv(env);
      messages = [];
      console.log($.dim("  cleared"));
      console.log();
      continue;
    }

    if (input === "programs") {
      const progs = await listPrograms();
      console.log();
      if (progs.length === 0) {
        console.log($.dim("  no programs stored yet"));
      } else {
        console.log($.bold("  stored programs:"));
        for (const p of progs.slice(0, 10)) {
          console.log(
            `  ${$.cyan(p.name)} ${$.dim(`(${p.useCount} uses)`)} - ${p.description}`,
          );
        }
        if (progs.length > 10) {
          console.log($.dim(`  ... +${progs.length - 10} more`));
        }
      }
      console.log();
      continue;
    }

    if (input === "session") {
      printSession(session);
      console.log();
      continue;
    }

    if (input === "env") {
      console.log();
      const keys = Object.keys(env);
      if (keys.length === 0) {
        console.log($.dim("  environment empty"));
      } else {
        for (const key of keys) {
          console.log(`  ${$.cyan(key)}: ${printValue(env[key])}`);
        }
      }
      console.log();
      continue;
    }

    // Run agent
    try {
      const result = await run(client, input, session, env, messages);
      env = result.env;
      messages = result.messages;
    } catch (e) {
      console.log();
      console.log(
        $.red(`  error: ${e instanceof Error ? e.message : String(e)}`),
      );
    }

    console.log();
  }
}

// =============================================================================
// Single-shot
// =============================================================================

async function singleShot(client: ApiClient, prompt: string): Promise<void> {
  const session = await loadSession();
  const env = await loadEnv();

  try {
    await run(client, prompt, session, env, []);
  } catch (e) {
    console.log($.red(`error: ${e instanceof Error ? e.message : String(e)}`));
  }
  console.log();
}

// =============================================================================
// Auth Commands
// =============================================================================

async function handleLogin(tokenArg?: string): Promise<void> {
  if (tokenArg) {
    // Direct token provided
    const config = await loadConfig();
    config.token = tokenArg;
    await saveConfig(config);
    console.log($.green("  ✓ Token saved"));

    // Verify token
    try {
      const response = await fetch(`${SAJ_API_URL}/me`, {
        headers: { Authorization: `Bearer ${tokenArg}` },
      });
      if (response.ok) {
        const user = await response.json();
        config.username = user.username;
        await saveConfig(config);
        console.log($.dim(`  Logged in as ${user.username}`));
      }
    } catch {
      console.log($.dim("  Could not verify token"));
    }
  } else {
    // Start local server to catch callback
    const port = 9876;
    let server: Deno.HttpServer | null = null;

    const tokenPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Login timeout"));
      }, 120000); // 2 min timeout

      server = Deno.serve({ port, onListen: () => {} }, async (req) => {
        const url = new URL(req.url);

        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code");

          if (code) {
            // Exchange code for token
            try {
              const tokenRes = await fetch(`${SAJ_API_URL}/auth/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
              });

              if (tokenRes.ok) {
                const data = await tokenRes.json();
                clearTimeout(timeout);
                resolve(data.token);

                return new Response(
                  `<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;background:#1a1a2e;color:white;margin:0">
                    <div style="text-align:center">
                      <h1 style="color:#e94560">λ</h1>
                      <h2>Logged in!</h2>
                      <p style="color:#888">You can close this window.</p>
                    </div>
                  </body></html>`,
                  { headers: { "Content-Type": "text/html" } },
                );
              }
            } catch (e) {
              clearTimeout(timeout);
              reject(e);
            }
          }

          return new Response("Error: No code", { status: 400 });
        }

        return new Response("Not found", { status: 404 });
      });
    });

    // Build OAuth URL with local callback
    const callbackUrl = `http://localhost:${port}/callback`;
    const loginUrl = `${SAJ_API_URL}/auth/github/cli?callback=${encodeURIComponent(callbackUrl)}`;

    console.log($.dim("  Opening browser for GitHub login..."));

    // Open browser
    const cmd =
      Deno.build.os === "darwin"
        ? "open"
        : Deno.build.os === "windows"
          ? "start"
          : "xdg-open";

    try {
      const command = new Deno.Command(cmd, { args: [loginUrl] });
      await command.output();
    } catch {
      console.log();
      console.log($.dim("  Visit this URL to login:"));
      console.log($.cyan(`  ${loginUrl}`));
    }

    console.log($.dim("  Waiting for authentication..."));

    try {
      const token = await tokenPromise;

      // Save token
      const config = await loadConfig();
      config.token = token;
      await saveConfig(config);

      // Verify and get username
      const response = await fetch(`${SAJ_API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const user = await response.json();
        config.username = user.username;
        await saveConfig(config);
        console.log();
        console.log($.green(`  ✓ Logged in as ${user.username}`));
      } else {
        console.log($.green("  ✓ Token saved"));
      }
    } catch (e) {
      console.log(
        $.red(`  Login failed: ${e instanceof Error ? e.message : String(e)}`),
      );
    } finally {
      if (server) {
        await (server as Deno.HttpServer).shutdown();
      }
    }
  }
}

async function handleLogout(): Promise<void> {
  const config = await loadConfig();
  delete config.token;
  delete config.username;
  await saveConfig(config);
  console.log($.dim("  Logged out"));
}

async function handleWhoami(): Promise<void> {
  const token = await getToken();
  if (!token) {
    console.log($.dim("  Not logged in"));
    console.log($.dim("  Run 'saj login' to authenticate"));
    return;
  }

  try {
    const response = await fetch(`${SAJ_API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const user = await response.json();
      console.log(`  ${$.green("λ")} ${$.bold(user.username)}`);
      console.log($.dim(`  Using: ${SAJ_API_URL}`));
    } else {
      console.log($.red("  Token invalid or expired"));
      console.log($.dim("  Run 'saj login' to re-authenticate"));
    }
  } catch (e) {
    console.log(
      $.red(`  Error: ${e instanceof Error ? e.message : String(e)}`),
    );
  }
}

async function handleUsage(): Promise<void> {
  const token = await getToken();
  if (!token) {
    console.log($.dim("  Not logged in"));
    return;
  }

  try {
    const response = await fetch(`${SAJ_API_URL}/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const usage = await response.json();
      console.log();
      console.log($.bold("  Usage this month:"));
      console.log(`  ${$.cyan("requests:")} ${usage.requests}`);
      console.log(
        `  ${$.cyan("tokens:")} ${formatTokens(usage.tokens.input)}↑ ${formatTokens(usage.tokens.output)}↓`,
      );
      if (usage.budget) {
        const budgetColor = usage.budget.percentUsed > 80 ? $.yellow : $.green;
        console.log(
          `  ${$.cyan("budget:")} $${usage.budget.used.toFixed(2)} / $${usage.budget.limit} (${budgetColor(usage.budget.percentUsed + "%")})`,
        );
      }
      console.log(
        `  ${$.cyan("rate limit:")} ${usage.rateLimit.remaining}/${usage.rateLimit.limit} remaining`,
      );
    } else {
      console.log($.red("  Could not fetch usage"));
    }
  } catch (e) {
    console.log(
      $.red(`  Error: ${e instanceof Error ? e.message : String(e)}`),
    );
  }
}

// =============================================================================
// Create Client
// =============================================================================

async function createClient(): Promise<ApiClient> {
  // Check for SAJ token (backend mode)
  const token = await getToken();
  if (token) {
    return new SajApiClient(SAJ_API_URL, token);
  }

  // Fall back to direct Anthropic API
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error($.red("  Not authenticated."));
    console.error($.dim("  Either:"));
    console.error($.dim("    1. Run 'saj login' to use hosted API"));
    console.error($.dim("    2. Set ANTHROPIC_API_KEY for direct access"));
    Deno.exit(1);
  }

  return new Anthropic({ apiKey });
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = Deno.args;

  // Handle auth commands
  if (args[0] === "login") {
    await handleLogin(args[1]);
    return;
  }

  if (args[0] === "logout") {
    await handleLogout();
    return;
  }

  if (args[0] === "whoami") {
    await handleWhoami();
    return;
  }

  if (args[0] === "usage") {
    await handleUsage();
    return;
  }

  if (args[0] === "update") {
    console.log($.dim("  Updating saj..."));
    // Fetch latest commit hash to bypass CDN cache
    const res = await fetch(
      "https://api.github.com/repos/rahulyal/saj/commits/main",
    );
    const commit = await res.json();
    const sha = commit.sha?.slice(0, 7) || "main";

    const cmd = new Deno.Command("deno", {
      args: [
        "install",
        "--global",
        "--allow-all",
        "--unstable-kv",
        "--name",
        "saj",
        "--force",
        "--reload",
        `https://cdn.jsdelivr.net/gh/rahulyal/saj@${sha}/saj.ts`,
      ],
      stdout: "inherit",
      stderr: "inherit",
    });
    const status = await cmd.spawn().status;
    if (status.success) {
      console.log($.green("  ✓ Updated to latest version"));
    } else {
      console.log($.red("  ✗ Update failed"));
    }
    return;
  }

  // Create client (backend or direct)
  const client = await createClient();

  if (args.length > 0) {
    await singleShot(client, args.join(" "));
  } else {
    await repl(client);
  }
}

main();
