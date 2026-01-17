import type {
  SajExpression,
  SajProgram,
  SajEffect,
} from "./schema.ts";

// ///////////////////////////////////////////////////////////////////////////
// Types
// ///////////////////////////////////////////////////////////////////////////

export type KvEnv = Record<string, unknown>;

export type EvalResult = {
  result: unknown;
  env: KvEnv;
  logs: string[];
};

export type ProcedureClosure = {
  type: "procedureClosure";
  procedure: {
    type: "procedure";
    inputs: string[];
    body: SajExpression;
  };
  scopedEnvironment: KvEnv;
};

// ///////////////////////////////////////////////////////////////////////////
// Effect Handlers - Dependency Injection for side effects
// ///////////////////////////////////////////////////////////////////////////

export type EffectHandlers = {
  kv: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: (prefix?: string) => Promise<Array<{ key: string; value: unknown }>>;
  };
  fetch: (
    url: string,
    options: { method: string; headers?: Record<string, string>; body?: unknown }
  ) => Promise<unknown>;
  log: (message: unknown) => void;
};

// Default in-memory effect handlers (for testing/local dev)
export const createInMemoryHandlers = (): EffectHandlers => {
  const store = new Map<string, unknown>();

  return {
    kv: {
      get: async (key) => store.get(key),
      set: async (key, value) => { store.set(key, value); },
      delete: async (key) => { store.delete(key); },
      list: async (prefix) => {
        const entries: Array<{ key: string; value: unknown }> = [];
        for (const [key, value] of store) {
          if (!prefix || key.startsWith(prefix)) {
            entries.push({ key, value });
          }
        }
        return entries;
      },
    },
    fetch: async (url, options) => {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return response.json();
    },
    log: (message) => console.log("[SAJ]", message),
  };
};

// Deno KV effect handlers
export const createDenoKvHandlers = (kv: Deno.Kv): EffectHandlers => {
  return {
    kv: {
      get: async (key) => {
        const result = await kv.get([key]);
        return result.value;
      },
      set: async (key, value) => {
        await kv.set([key], value);
      },
      delete: async (key) => {
        await kv.delete([key]);
      },
      list: async (prefix) => {
        const entries: Array<{ key: string; value: unknown }> = [];
        const iter = kv.list({ prefix: prefix ? [prefix] : [] });
        for await (const entry of iter) {
          entries.push({
            key: entry.key.join("/"),
            value: entry.value,
          });
        }
        return entries;
      },
    },
    fetch: async (url, options) => {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return response.json();
    },
    log: (message) => console.log("[SAJ]", message),
  };
};

// ///////////////////////////////////////////////////////////////////////////
// Async Evaluator with Effect Support
// ///////////////////////////////////////////////////////////////////////////

export async function evaluate(
  expression: SajExpression | SajProgram,
  env: KvEnv,
  handlers: EffectHandlers,
  logs: string[] = []
): Promise<EvalResult> {
  const expr = expression as Record<string, unknown>;

  // Primitives
  if (expr.type === "number" || expr.type === "string" || expr.type === "boolean") {
    return { result: expr.value, env, logs };
  }

  // Variable lookup
  if (expr.type === "variable") {
    const key = expr.key as string;
    if (!(key in env)) {
      throw new Error(`Undefined variable: ${key}`);
    }
    return { result: env[key], env, logs };
  }

  // Definition
  if (expr.type === "definition") {
    const keyVar = expr.key as { key: string };
    const { result, logs: newLogs } = await evaluate(
      expr.value as SajExpression,
      env,
      handlers,
      logs
    );
    const newEnv = { ...env, [keyVar.key]: result };
    return { result: null, env: newEnv, logs: newLogs };
  }

  // Procedure - create closure
  if (expr.type === "procedure") {
    const closure: ProcedureClosure = {
      type: "procedureClosure",
      procedure: expr as ProcedureClosure["procedure"],
      scopedEnvironment: { ...env },
    };
    return { result: closure, env, logs };
  }

  // Arithmetic operations
  if (expr.type === "arithmeticOperation") {
    const operands = expr.operands as SajExpression[];
    const evaluatedOperands: number[] = [];

    for (const operand of operands) {
      const { result, logs: newLogs } = await evaluate(operand, env, handlers, logs);
      logs = newLogs;
      evaluatedOperands.push(result as number);
    }

    let result: number;
    switch (expr.operation) {
      case "+":
        result = evaluatedOperands.reduce((a, b) => a + b);
        break;
      case "-":
        result = evaluatedOperands.reduce((a, b) => a - b);
        break;
      case "*":
        result = evaluatedOperands.reduce((a, b) => a * b);
        break;
      case "/":
        result = evaluatedOperands.reduce((a, b) => a / b);
        break;
      default:
        throw new Error(`Unknown arithmetic operation: ${expr.operation}`);
    }

    return { result, env, logs };
  }

  // Comparative operations
  if (expr.type === "comparativeOperation") {
    const operands = expr.operands as SajExpression[];
    const evaluatedOperands: number[] = [];

    for (const operand of operands) {
      const { result, logs: newLogs } = await evaluate(operand, env, handlers, logs);
      logs = newLogs;
      evaluatedOperands.push(result as number);
    }

    // For comparison, we check pairwise
    let result: boolean;
    const [first, second] = evaluatedOperands;

    switch (expr.operation) {
      case "=":
        result = first === second;
        break;
      case ">":
        result = first > second;
        break;
      case "<":
        result = first < second;
        break;
      case ">=":
        result = first >= second;
        break;
      case "<=":
        result = first <= second;
        break;
      case "!=":
        result = first !== second;
        break;
      default:
        throw new Error(`Unknown comparative operation: ${expr.operation}`);
    }

    return { result, env, logs };
  }

  // Conditional
  if (expr.type === "conditional") {
    const { result: condResult, logs: newLogs } = await evaluate(
      expr.condition as SajExpression,
      env,
      handlers,
      logs
    );
    logs = newLogs;

    if (condResult) {
      return evaluate(expr.trueReturn as SajExpression, env, handlers, logs);
    } else {
      return evaluate(expr.falseReturn as SajExpression, env, handlers, logs);
    }
  }

  // Procedure call
  if (expr.type === "procedureCall") {
    let closure: ProcedureClosure;

    const proc = expr.procedure as Record<string, unknown>;
    if (proc.type === "variable") {
      const key = proc.key as string;
      closure = env[key] as ProcedureClosure;
      if (!closure || closure.type !== "procedureClosure") {
        throw new Error(`${key} is not a procedure`);
      }
    } else {
      const { result, logs: newLogs } = await evaluate(
        proc as SajExpression,
        env,
        handlers,
        logs
      );
      logs = newLogs;
      closure = result as ProcedureClosure;
    }

    // Evaluate arguments
    const args = expr.arguments as SajExpression[];
    const evaluatedArgs: unknown[] = [];
    for (const arg of args) {
      const { result, logs: newLogs } = await evaluate(arg, env, handlers, logs);
      logs = newLogs;
      evaluatedArgs.push(result);
    }

    // Create local scope with bound arguments
    const localEnv = { ...closure.scopedEnvironment };
    closure.procedure.inputs.forEach((input, i) => {
      localEnv[input] = evaluatedArgs[i];
    });

    // Evaluate body in local scope
    const { result, logs: bodyLogs } = await evaluate(
      closure.procedure.body,
      localEnv,
      handlers,
      logs
    );

    return { result, env, logs: bodyLogs };
  }

  // Effects
  if (expr.type === "effect") {
    return evaluateEffect(expr as unknown as SajEffect, env, handlers, logs);
  }

  throw new Error(`Unknown expression type: ${expr.type}`);
}

// ///////////////////////////////////////////////////////////////////////////
// Effect Evaluation
// ///////////////////////////////////////////////////////////////////////////

async function evaluateEffect(
  effect: SajEffect,
  env: KvEnv,
  handlers: EffectHandlers,
  logs: string[]
): Promise<EvalResult> {
  switch (effect.action) {
    case "kv:get": {
      const result = await handlers.kv.get(effect.key);
      return { result, env, logs };
    }

    case "kv:set": {
      const { result: value, logs: newLogs } = await evaluate(
        effect.value as SajExpression,
        env,
        handlers,
        logs
      );
      await handlers.kv.set(effect.key, value);
      return { result: null, env, logs: newLogs };
    }

    case "kv:delete": {
      await handlers.kv.delete(effect.key);
      return { result: null, env, logs };
    }

    case "kv:list": {
      const result = await handlers.kv.list(effect.prefix);
      return { result, env, logs };
    }

    case "fetch": {
      let body: unknown = undefined;
      let currentLogs = logs;

      if (effect.body) {
        const { result, logs: newLogs } = await evaluate(
          effect.body as SajExpression,
          env,
          handlers,
          logs
        );
        body = result;
        currentLogs = newLogs;
      }

      const result = await handlers.fetch(effect.url, {
        method: effect.method ?? "GET",
        headers: effect.headers,
        body,
      });

      return { result, env, logs: currentLogs };
    }

    case "log": {
      const { result: message, logs: newLogs } = await evaluate(
        effect.message as SajExpression,
        env,
        handlers,
        logs
      );
      handlers.log(message);
      return { result: null, env, logs: [...newLogs, String(message)] };
    }

    case "sequence": {
      let currentEnv = env;
      let currentLogs = logs;
      let lastResult: unknown = null;

      for (const step of effect.steps) {
        const { result, env: newEnv, logs: newLogs } = await evaluate(
          step as SajExpression,
          currentEnv,
          handlers,
          currentLogs
        );
        currentEnv = newEnv;
        currentLogs = newLogs;
        lastResult = result;
      }

      return { result: lastResult, env: currentEnv, logs: currentLogs };
    }

    case "let": {
      // Evaluate the value expression
      const { result: value, logs: newLogs } = await evaluate(
        effect.value as SajExpression,
        env,
        handlers,
        logs
      );

      // Bind the result to the variable name in a new scope
      const newEnv = { ...env, [effect.binding]: value };

      // Evaluate the body with the binding
      return evaluate(effect.body as SajExpression, newEnv, handlers, newLogs);
    }

    default:
      throw new Error(`Unknown effect action: ${(effect as { action: string }).action}`);
  }
}

// ///////////////////////////////////////////////////////////////////////////
// Convenience function to run a program
// ///////////////////////////////////////////////////////////////////////////

export async function runProgram(
  program: SajProgram,
  options: {
    env?: KvEnv;
    handlers?: EffectHandlers;
  } = {}
): Promise<EvalResult> {
  const env = options.env ?? {};
  const handlers = options.handlers ?? createInMemoryHandlers();

  return evaluate(program, env, handlers, []);
}
