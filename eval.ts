/**
 * SAJ Evaluator
 *
 * Async evaluator for SAJ expressions with effect handling.
 * Takes SAJ JSON structures and executes them.
 */

import type {
  SajProgram,
  SajExpression,
  Environment,
  EvalResult,
  ProcedureClosure,
} from "./types.ts";

// =============================================================================
// Effect Handler Type
// =============================================================================

export type EffectHandlerFn = (
  name: string,
  args: Record<string, unknown>
) => Promise<unknown>;

/**
 * Evaluate a SAJ expression in an environment
 */
export async function evaluate(
  expression: SajProgram,
  env: Environment,
  effectHandler?: EffectHandlerFn
): Promise<EvalResult> {
  switch (expression.type) {
    // =========================================================================
    // Primitives - self-evaluating
    // =========================================================================
    case "number":
    case "string":
    case "boolean":
      return { result: expression.value, env };

    // =========================================================================
    // Variable lookup
    // =========================================================================
    case "variable": {
      const value = env[expression.key];
      if (value === undefined) {
        throw new Error(`Undefined variable: ${expression.key}`);
      }
      return { result: value, env };
    }

    // =========================================================================
    // Definition - bind name to value
    // =========================================================================
    case "definition": {
      const { result } = await evaluate(expression.value, env, effectHandler);
      const newEnv = { ...env, [expression.key.key]: result };

      // Fix for recursive procedures: update the closure's environment
      // so it can reference itself by name
      if (
        result &&
        typeof result === "object" &&
        (result as ProcedureClosure).type === "procedureClosure"
      ) {
        const closure = result as ProcedureClosure;
        closure.scopedEnvironment = newEnv;
      }

      return { result: null, env: newEnv };
    }

    // =========================================================================
    // Procedure - create closure
    // =========================================================================
    case "procedure": {
      const closure: ProcedureClosure = {
        type: "procedureClosure",
        procedure: expression,
        scopedEnvironment: { ...env },
      };
      return { result: closure, env };
    }

    // =========================================================================
    // Arithmetic operations
    // =========================================================================
    case "arithmeticOperation": {
      const values: number[] = [];
      for (const op of expression.operands) {
        const { result } = await evaluate(op as SajExpression, env, effectHandler);
        values.push(result as number);
      }

      let result: number;
      switch (expression.operation) {
        case "+":
          result = values.reduce((a, b) => a + b);
          break;
        case "-":
          result = values.reduce((a, b) => a - b);
          break;
        case "*":
          result = values.reduce((a, b) => a * b);
          break;
        case "/":
          result = values.reduce((a, b) => a / b);
          break;
      }
      return { result, env };
    }

    // =========================================================================
    // Comparative operations
    // =========================================================================
    case "comparativeOperation": {
      const values: number[] = [];
      for (const op of expression.operands) {
        const { result } = await evaluate(op as SajExpression, env, effectHandler);
        values.push(result as number);
      }

      let result: boolean;
      switch (expression.operation) {
        case "=":
          result = values.every((v, i, arr) => i === 0 || v === arr[i - 1]);
          break;
        case "<":
          result = values.every((v, i, arr) => i === 0 || arr[i - 1] < v);
          break;
        case ">":
          result = values.every((v, i, arr) => i === 0 || arr[i - 1] > v);
          break;
      }
      return { result, env };
    }

    // =========================================================================
    // Conditional
    // =========================================================================
    case "conditional": {
      const { result: condition } = await evaluate(
        expression.condition as SajExpression,
        env,
        effectHandler
      );
      if (condition) {
        return evaluate(expression.trueReturn as SajExpression, env, effectHandler);
      } else {
        return evaluate(expression.falseReturn as SajExpression, env, effectHandler);
      }
    }

    // =========================================================================
    // Procedure call (function application)
    // =========================================================================
    case "procedureCall": {
      // Get the procedure (either inline or from variable)
      let closure: ProcedureClosure;

      if (expression.procedure.type === "variable") {
        const value = env[expression.procedure.key];
        if (!value || (value as ProcedureClosure).type !== "procedureClosure") {
          throw new Error(`Not a procedure: ${expression.procedure.key}`);
        }
        closure = value as ProcedureClosure;
      } else {
        // Inline procedure - create closure
        const { result } = await evaluate(expression.procedure, env, effectHandler);
        closure = result as ProcedureClosure;
      }

      // Evaluate arguments
      const args: unknown[] = [];
      for (const arg of expression.arguments) {
        const { result } = await evaluate(arg as SajExpression, env, effectHandler);
        args.push(result);
      }

      // Create local environment with parameters bound to arguments
      const localEnv = { ...closure.scopedEnvironment };
      closure.procedure.inputs.forEach((param, i) => {
        localEnv[param] = args[i];
      });

      // Evaluate body in local environment
      const { result } = await evaluate(
        closure.procedure.body as SajExpression,
        localEnv,
        effectHandler
      );
      return { result, env };
    }

    // =========================================================================
    // Effect - async operations handled by runtime
    // =========================================================================
    case "effect": {
      if (!effectHandler) {
        throw new Error(`Effect "${expression.name}" called but no effect handler provided`);
      }

      // Evaluate all argument expressions (or use raw values if not SAJ)
      const evaluatedArgs: Record<string, unknown> = {};
      for (const [key, argExpr] of Object.entries(expression.args)) {
        // Check if it's a SAJ expression (has "type" property)
        if (argExpr && typeof argExpr === "object" && "type" in argExpr) {
          const { result } = await evaluate(argExpr as SajExpression, env, effectHandler);
          evaluatedArgs[key] = result;
        } else {
          // Raw value - use directly
          evaluatedArgs[key] = argExpr;
        }
      }

      // Call the effect handler
      const effectResult = await effectHandler(expression.name, evaluatedArgs);

      // If there's a bind, add result to environment
      let newEnv = env;
      if (expression.bind) {
        newEnv = { ...env, [expression.bind]: effectResult };
      }

      // If there's a continuation (then), evaluate it
      if (expression.then) {
        return evaluate(expression.then as SajExpression, newEnv, effectHandler);
      }

      return { result: effectResult, env: newEnv };
    }

    default:
      throw new Error(`Unknown expression type: ${(expression as Record<string, unknown>).type}`);
  }
}

/**
 * Execute a SAJ program and return the result
 */
export async function execute(
  program: SajProgram,
  initialEnv: Environment = {},
  effectHandler?: EffectHandlerFn
): Promise<{ result: unknown; env: Environment }> {
  return await evaluate(program, initialEnv, effectHandler);
}

/**
 * Execute multiple SAJ programs in sequence, threading the environment
 */
export async function executeSequence(
  programs: SajProgram[],
  initialEnv: Environment = {},
  effectHandler?: EffectHandlerFn
): Promise<{ results: unknown[]; env: Environment }> {
  let env = initialEnv;
  const results: unknown[] = [];

  for (const program of programs) {
    const { result, env: newEnv } = await evaluate(program, env, effectHandler);
    results.push(result);
    env = newEnv;
  }

  return { results, env };
}

/**
 * Pretty print a SAJ value
 */
export function printValue(value: unknown): string {
  if (value === null) return "nil";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "boolean") return value ? "#true" : "#false";
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.type === "procedureClosure") {
      return "#<procedure>";
    }
    // For effect results that are objects
    return JSON.stringify(obj);
  }
  return String(value);
}
