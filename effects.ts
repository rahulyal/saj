/**
 * SAJ Effect Handlers
 *
 * Provides async I/O and recursive LLM call capabilities.
 * Inspired by MIT's RLM (Recursive Language Models) paper.
 */

import Anthropic from "@anthropic-ai/sdk";

// =============================================================================
// Effect Context
// =============================================================================

export interface EffectContext {
  anthropicClient?: Anthropic;
  model?: string;
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

/**
 * Recursive LLM call handler
 *
 * This is the key innovation from MIT's RLM paper:
 * An LLM can call itself on sub-problems, enabling:
 * - Task decomposition
 * - Recursive problem solving
 * - Agentic loops within the language itself
 */
const llmCallHandler: EffectHandler = async (args, context) => {
  if (!context.anthropicClient) {
    throw new Error("llm_call requires an Anthropic client in context");
  }

  const prompt = args.prompt as string;
  const expectType = args.expect as string | undefined;
  const systemPrompt = args.system as string | undefined;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  const response = await context.anthropicClient.messages.create({
    model: context.model || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt || "You are a helpful assistant. Respond concisely.",
    messages,
  });

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
  fetch: fetchHandler,
  read_file: readFileHandler,
  write_file: writeFileHandler,
  shell: shellHandler,
  print: printHandler,
  llm_call: llmCallHandler,
};

// =============================================================================
// Create Effect Handler
// =============================================================================

export interface EffectHandlerConfig {
  anthropicClient?: Anthropic;
  model?: string;
  customHandlers?: Record<string, EffectHandler>;
}

/**
 * Create an effect handler function that can be passed to the evaluator
 */
export function createEffectHandler(
  config: EffectHandlerConfig = {},
): (name: string, args: Record<string, unknown>) => Promise<unknown> {
  const context: EffectContext = {
    anthropicClient: config.anthropicClient,
    model: config.model,
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
