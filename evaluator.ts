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

  // List literal
  if (expr.type === "list") {
    const elements = expr.elements as SajExpression[];
    const evaluatedElements: unknown[] = [];

    for (const element of elements) {
      const { result, logs: newLogs } = await evaluate(element, env, handlers, logs);
      logs = newLogs;
      evaluatedElements.push(result);
    }

    return { result: evaluatedElements, env, logs };
  }

  // List operations
  if (expr.type === "listOperation") {
    return evaluateListOperation(expr as Record<string, unknown>, env, handlers, logs);
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
// List Operation Evaluation
// ///////////////////////////////////////////////////////////////////////////

async function evaluateListOperation(
  op: Record<string, unknown>,
  env: KvEnv,
  handlers: EffectHandlers,
  logs: string[]
): Promise<EvalResult> {
  const operation = op.operation as string;

  // Helper to evaluate and expect a list
  async function evalList(expr: unknown): Promise<{ list: unknown[]; logs: string[] }> {
    const { result, logs: newLogs } = await evaluate(
      expr as SajExpression,
      env,
      handlers,
      logs
    );
    if (!Array.isArray(result)) {
      throw new Error(`Expected list, got ${typeof result}`);
    }
    return { list: result, logs: newLogs };
  }

  // Helper to apply a procedure to arguments
  async function applyProcedure(
    proc: unknown,
    args: unknown[],
    currentLogs: string[]
  ): Promise<{ result: unknown; logs: string[] }> {
    let closure: ProcedureClosure;

    const procExpr = proc as Record<string, unknown>;
    if (procExpr.type === "variable") {
      const key = procExpr.key as string;
      closure = env[key] as ProcedureClosure;
      if (!closure || closure.type !== "procedureClosure") {
        throw new Error(`${key} is not a procedure`);
      }
    } else if (procExpr.type === "procedure") {
      closure = {
        type: "procedureClosure",
        procedure: procExpr as ProcedureClosure["procedure"],
        scopedEnvironment: { ...env },
      };
    } else {
      throw new Error("Expected procedure or variable reference");
    }

    // Create local scope with bound arguments
    const localEnv = { ...closure.scopedEnvironment };
    closure.procedure.inputs.forEach((input, i) => {
      localEnv[input] = args[i];
    });

    // Evaluate body in local scope
    const { result, logs: bodyLogs } = await evaluate(
      closure.procedure.body,
      localEnv,
      handlers,
      currentLogs
    );

    return { result, logs: bodyLogs };
  }

  switch (operation) {
    case "sum": {
      const { list, logs: newLogs } = await evalList(op.list);
      const result = (list as number[]).reduce((a, b) => a + b, 0);
      return { result, env, logs: newLogs };
    }

    case "product": {
      const { list, logs: newLogs } = await evalList(op.list);
      const result = (list as number[]).reduce((a, b) => a * b, 1);
      return { result, env, logs: newLogs };
    }

    case "length": {
      const { list, logs: newLogs } = await evalList(op.list);
      return { result: list.length, env, logs: newLogs };
    }

    case "head": {
      const { list, logs: newLogs } = await evalList(op.list);
      if (list.length === 0) {
        throw new Error("Cannot get head of empty list");
      }
      return { result: list[0], env, logs: newLogs };
    }

    case "tail": {
      const { list, logs: newLogs } = await evalList(op.list);
      if (list.length === 0) {
        throw new Error("Cannot get tail of empty list");
      }
      return { result: list.slice(1), env, logs: newLogs };
    }

    case "nth": {
      const { list, logs: listLogs } = await evalList(op.list);
      const { result: indexResult, logs: indexLogs } = await evaluate(
        op.index as SajExpression,
        env,
        handlers,
        listLogs
      );
      const index = indexResult as number;
      if (index < 0 || index >= list.length) {
        throw new Error(`Index ${index} out of bounds for list of length ${list.length}`);
      }
      return { result: list[index], env, logs: indexLogs };
    }

    case "concat": {
      const lists = op.lists as SajExpression[];
      const result: unknown[] = [];
      let currentLogs = logs;

      for (const listExpr of lists) {
        const { list, logs: newLogs } = await evalList(listExpr);
        currentLogs = newLogs;
        result.push(...list);
      }

      return { result, env, logs: currentLogs };
    }

    case "range": {
      const { result: startResult, logs: startLogs } = await evaluate(
        op.start as SajExpression,
        env,
        handlers,
        logs
      );
      const { result: endResult, logs: endLogs } = await evaluate(
        op.end as SajExpression,
        env,
        handlers,
        startLogs
      );

      let step = 1;
      let currentLogs = endLogs;

      if (op.step) {
        const { result: stepResult, logs: stepLogs } = await evaluate(
          op.step as SajExpression,
          env,
          handlers,
          endLogs
        );
        step = stepResult as number;
        currentLogs = stepLogs;
      }

      const start = startResult as number;
      const end = endResult as number;
      const result: number[] = [];

      if (step > 0) {
        for (let i = start; i < end; i += step) {
          result.push(i);
        }
      } else if (step < 0) {
        for (let i = start; i > end; i += step) {
          result.push(i);
        }
      }

      return { result, env, logs: currentLogs };
    }

    case "map": {
      const { list, logs: listLogs } = await evalList(op.list);
      const proc = op.procedure;
      const result: unknown[] = [];
      let currentLogs = listLogs;

      for (const item of list) {
        const { result: mappedResult, logs: newLogs } = await applyProcedure(
          proc,
          [item],
          currentLogs
        );
        currentLogs = newLogs;
        result.push(mappedResult);
      }

      return { result, env, logs: currentLogs };
    }

    case "filter": {
      const { list, logs: listLogs } = await evalList(op.list);
      const pred = op.predicate;
      const result: unknown[] = [];
      let currentLogs = listLogs;

      for (const item of list) {
        const { result: passResult, logs: newLogs } = await applyProcedure(
          pred,
          [item],
          currentLogs
        );
        currentLogs = newLogs;
        if (passResult) {
          result.push(item);
        }
      }

      return { result, env, logs: currentLogs };
    }

    case "reduce": {
      const { list, logs: listLogs } = await evalList(op.list);
      const { result: initial, logs: initLogs } = await evaluate(
        op.initial as SajExpression,
        env,
        handlers,
        listLogs
      );
      const proc = op.procedure;

      let acc = initial;
      let currentLogs = initLogs;

      for (const item of list) {
        const { result: newAcc, logs: newLogs } = await applyProcedure(
          proc,
          [acc, item],
          currentLogs
        );
        acc = newAcc;
        currentLogs = newLogs;
      }

      return { result: acc, env, logs: currentLogs };
    }

    case "min": {
      const { list, logs: newLogs } = await evalList(op.list);
      if (list.length === 0) {
        throw new Error("Cannot get min of empty list");
      }
      const result = Math.min(...(list as number[]));
      return { result, env, logs: newLogs };
    }

    case "max": {
      const { list, logs: newLogs } = await evalList(op.list);
      if (list.length === 0) {
        throw new Error("Cannot get max of empty list");
      }
      const result = Math.max(...(list as number[]));
      return { result, env, logs: newLogs };
    }

    case "average": {
      const { list, logs: newLogs } = await evalList(op.list);
      if (list.length === 0) {
        throw new Error("Cannot get average of empty list");
      }
      const sum = (list as number[]).reduce((a, b) => a + b, 0);
      const result = sum / list.length;
      return { result, env, logs: newLogs };
    }

    default:
      throw new Error(`Unknown list operation: ${operation}`);
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
