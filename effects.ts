/**
 * SAJ Effect Handlers
 *
 * Provides async I/O and recursive LLM call capabilities.
 * Inspired by MIT's RLM (Recursive Language Models) paper.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.52.0";

// =============================================================================
// Effect Context
// =============================================================================

// Interface for any client that can create messages (Anthropic SDK or proxy)
export interface MessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface EffectContext {
  llmClient?: MessagesClient;  // Any client with messages.create
  model?: string;
  contextStore?: Map<string, string>;  // RLM: shared context for sub-calls
  depth?: number;                       // RLM: recursion depth tracking
  maxDepth?: number;                    // RLM: max recursion depth
}

// =============================================================================
// Effect Handler Type
// =============================================================================

export type EffectHandler = (
  args: Record<string, unknown>,
  context: EffectContext,
) => Promise<unknown>;

// =============================================================================
// Built-in Effect Handlers
// =============================================================================

const fetchHandler: EffectHandler = async (args) => {
  const url = args.url as string;
  const method = (args.method as string) || "GET";
  const headers = (args.headers as Record<string, string>) || {};
  const body = args.body as string | undefined;

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  return response.text();
};

const readFileHandler: EffectHandler = async (args) => {
  const path = args.path as string;
  return await Deno.readTextFile(path);
};

const writeFileHandler: EffectHandler = async (args) => {
  const path = args.path as string;
  const content = args.content as string;
  await Deno.writeTextFile(path, content);
  return "ok";
};

const shellHandler: EffectHandler = async (args) => {
  const cmd = args.cmd as string;
  const shellArgs = (args.args as string[]) || [];

  const command = new Deno.Command(cmd, {
    args: shellArgs,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();
  const stdoutText = new TextDecoder().decode(stdout);
  const stderrText = new TextDecoder().decode(stderr);

  return {
    code,
    stdout: stdoutText,
    stderr: stderrText,
  };
};

const printHandler: EffectHandler = (args) => {
  // Don't console.log - just return the value (it will be displayed in results)
  return Promise.resolve(args.value);
};

// =============================================================================
// File Operations - Performant file processing without full load
// =============================================================================

/**
 * Grep a file directly without loading it all into context
 * Args: {path, pattern, invert?, max_matches?}
 */
const fileGrepHandler: EffectHandler = async (args) => {
  const path = args.path as string;
  const pattern = args.pattern as string;
  const invert = args.invert as boolean | undefined;
  const maxMatches = (args.max_matches as number) || 100;

  const content = await Deno.readTextFile(path);
  const regex = new RegExp(pattern, "i");
  const lines = content.split("\n");

  const matches: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    const match = regex.test(lines[i]);
    if (invert ? !match : match) {
      matches.push({ line: i + 1, text: lines[i] });
    }
  }

  return {
    path,
    pattern,
    match_count: matches.length,
    truncated: matches.length >= maxMatches,
    matches,
  };
};

/**
 * Get file stats without reading content
 * Args: {path}
 */
const fileStatHandler: EffectHandler = async (args) => {
  const path = args.path as string;
  const stat = await Deno.stat(path);

  // For text files, count lines efficiently
  let lines = 0;
  if (stat.isFile) {
    const content = await Deno.readTextFile(path);
    lines = content.split("\n").length;
  }

  return {
    path,
    size: stat.size,
    lines,
    isFile: stat.isFile,
    isDirectory: stat.isDirectory,
    modified: stat.mtime?.toISOString(),
  };
};

/**
 * Read specific line range from file
 * Args: {path, start, end}
 */
const fileSliceHandler: EffectHandler = async (args) => {
  const path = args.path as string;
  const start = (args.start as number) || 1;
  const end = args.end as number | undefined;

  const content = await Deno.readTextFile(path);
  const lines = content.split("\n");
  const sliced = lines.slice(start - 1, end);

  return {
    path,
    start,
    end: end || lines.length,
    total_lines: lines.length,
    content: sliced.join("\n"),
  };
};

/**
 * List files matching a glob pattern
 * Args: {pattern, path?}
 */
const globHandler: EffectHandler = async (args) => {
  const pattern = args.pattern as string;
  const basePath = (args.path as string) || ".";

  const files: string[] = [];

  // Simple glob implementation using Deno's fs
  const walkDir = async (dir: string) => {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory && !entry.name.startsWith(".")) {
        await walkDir(fullPath);
      } else if (entry.isFile) {
        // Simple pattern matching
        const regex = new RegExp(
          pattern
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".")
        );
        if (regex.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  };

  await walkDir(basePath);
  return files.slice(0, 100); // Limit results
};

// =============================================================================
// RLM Context Store - Shared state for recursive sub-calls
// =============================================================================

/**
 * Store text in context store
 * Args: {name, text}
 */
const contextSetHandler: EffectHandler = (args, context) => {
  const name = args.name as string;
  const text = args.text as string;

  if (!context.contextStore) {
    context.contextStore = new Map();
  }
  context.contextStore.set(name, text);

  return Promise.resolve({ stored: name, length: text.length });
};

/**
 * Retrieve text from context store
 * Args: {name}
 */
const contextGetHandler: EffectHandler = (args, context) => {
  const name = args.name as string;

  if (!context.contextStore) {
    return Promise.resolve({ error: "No context store initialized" });
  }

  const text = context.contextStore.get(name);
  if (text === undefined) {
    return Promise.resolve({ error: `Context "${name}" not found` });
  }

  return Promise.resolve(text);
};

/**
 * List all stored contexts
 * Args: {}
 */
const contextListHandler: EffectHandler = (_args, context) => {
  if (!context.contextStore) {
    return Promise.resolve([]);
  }

  const contexts: { name: string; length: number }[] = [];
  context.contextStore.forEach((text, name) => {
    contexts.push({ name, length: text.length });
  });

  return Promise.resolve(contexts);
};

/**
 * Clear a context or all contexts
 * Args: {name?} - if no name, clears all
 */
const contextClearHandler: EffectHandler = (args, context) => {
  const name = args.name as string | undefined;

  if (!context.contextStore) {
    return Promise.resolve({ cleared: 0 });
  }

  if (name) {
    const existed = context.contextStore.delete(name);
    return Promise.resolve({ cleared: existed ? 1 : 0 });
  }

  const count = context.contextStore.size;
  context.contextStore.clear();
  return Promise.resolve({ cleared: count });
};

// =============================================================================
// Recursive LLM Call
// =============================================================================

/**
 * Recursive LLM call handler
 *
 * This is the key innovation from MIT's RLM paper:
 * An LLM can call itself on sub-problems, enabling:
 * - Task decomposition
 * - Recursive problem solving
 * - Agentic loops within the language itself
 *
 * RLM enhancements:
 * - context_name: reference stored context by name
 * - depth: current recursion depth (auto-incremented)
 * - max_depth: maximum allowed recursion depth
 */
const llmCallHandler: EffectHandler = async (args, context) => {
  if (!context.llmClient) {
    throw new Error("llm_call requires an LLM client in context");
  }

  // RLM: Check recursion depth
  const currentDepth = context.depth ?? 0;
  const maxDepth = (args.max_depth as number) ?? context.maxDepth ?? 10;

  if (currentDepth >= maxDepth) {
    return { error: `Max recursion depth (${maxDepth}) exceeded` };
  }

  let prompt = args.prompt as string;
  const expectType = args.expect as string | undefined;
  const systemPrompt = args.system as string | undefined;
  const contextName = args.context_name as string | undefined;

  // RLM: Inject stored context if referenced
  if (contextName && context.contextStore) {
    const storedContext = context.contextStore.get(contextName);
    if (storedContext) {
      prompt = `Context "${contextName}":\n${storedContext}\n\n---\n\n${prompt}`;
    }
  }

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  const response = await context.llmClient.messages.create({
    model: context.model || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt || "You are a helpful assistant. Respond concisely.",
    messages,
  });

  // Update depth for any nested calls
  context.depth = currentDepth + 1;

  // Extract text from response
  const textContent = response.content.find(
    (block: Anthropic.ContentBlock) => block.type === "text",
  );
  const responseText = textContent?.type === "text" ? textContent.text : "";

  // Parse response based on expected type
  if (expectType === "number") {
    const num = parseFloat(responseText.trim());
    if (!isNaN(num)) return num;
    // Try to extract first number from response
    const match = responseText.match(/-?\d+\.?\d*/);
    return match ? parseFloat(match[0]) : responseText;
  } else if (expectType === "boolean") {
    const lower = responseText.toLowerCase().trim();
    if (lower === "true" || lower === "yes") return true;
    if (lower === "false" || lower === "no") return false;
    return responseText;
  } else if (expectType === "json") {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  return responseText;
};

// =============================================================================
// Effect Handler Registry
// =============================================================================

const defaultHandlers: Record<string, EffectHandler> = {
  // Core I/O
  fetch: fetchHandler,
  read_file: readFileHandler,
  write_file: writeFileHandler,
  shell: shellHandler,
  print: printHandler,

  // File operations (performant)
  file_grep: fileGrepHandler,
  file_stat: fileStatHandler,
  file_slice: fileSliceHandler,
  glob: globHandler,

  // Context store (for RLM)
  context_set: contextSetHandler,
  context_get: contextGetHandler,
  context_list: contextListHandler,
  context_clear: contextClearHandler,

  // Recursive LLM
  llm_call: llmCallHandler,
};

// =============================================================================
// Create Effect Handler
// =============================================================================

export interface EffectHandlerConfig {
  llmClient?: MessagesClient;  // Any client with messages.create
  model?: string;
  customHandlers?: Record<string, EffectHandler>;
  contextStore?: Map<string, string>;  // RLM: shared context store
  maxDepth?: number;                    // RLM: max recursion depth
}

/**
 * Create an effect handler function that can be passed to the evaluator
 */
export function createEffectHandler(
  config: EffectHandlerConfig = {},
): (name: string, args: Record<string, unknown>) => Promise<unknown> {
  const context: EffectContext = {
    llmClient: config.llmClient,
    model: config.model,
    contextStore: config.contextStore ?? new Map(),  // RLM: init context store
    depth: 0,                                         // RLM: start at depth 0
    maxDepth: config.maxDepth ?? 10,                  // RLM: default max depth
  };

  const handlers = { ...defaultHandlers, ...config.customHandlers };

  return async (name: string, args: Record<string, unknown>) => {
    const handler = handlers[name];
    if (!handler) {
      throw new Error(`Unknown effect: ${name}`);
    }
    return await handler(args, context);
  };
}

/**
 * Default effect handler without LLM capabilities
 */
export const defaultEffectHandler = createEffectHandler();
