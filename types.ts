/**
 * SAJ Type Definitions
 *
 * These are the core types that make SAJ Turing complete.
 * The LLM outputs these structures directly - no parsing needed.
 */

// =============================================================================
// Primitive Types
// =============================================================================

export interface SajNumber {
  type: "number";
  value: number;
}

export interface SajString {
  type: "string";
  value: string;
}

export interface SajBoolean {
  type: "boolean";
  value: boolean;
}

export type SajPrimitive = SajNumber | SajString | SajBoolean;

// =============================================================================
// Expression Types
// =============================================================================

export interface SajVariable {
  type: "variable";
  key: string;
}

export interface ArithmeticOperation {
  type: "arithmeticOperation";
  operation: "+" | "-" | "*" | "/";
  operands: SajExpression[];
}

export interface ComparativeOperation {
  type: "comparativeOperation";
  operation: "<" | "=" | ">";
  operands: SajExpression[];
}

export interface Procedure {
  type: "procedure";
  inputs: string[];
  body: SajExpression;
}

export interface ProcedureCall {
  type: "procedureCall";
  procedure: SajVariable | Procedure;
  arguments: SajExpression[];
}

export interface Conditional {
  type: "conditional";
  condition: SajExpression;
  trueReturn: SajExpression;
  falseReturn: SajExpression;
}

// =============================================================================
// Effects (async, handled by runtime)
// =============================================================================

export interface Effect {
  type: "effect";
  name: string;
  args: Record<string, SajExpression>;
  bind?: string;  // variable name to bind result to
  then?: SajExpression;  // continuation
}

// =============================================================================
// Special Forms
// =============================================================================

export interface Definition {
  type: "definition";
  key: SajVariable;
  value: SajExpression;
}

// =============================================================================
// Union Types
// =============================================================================

export type SajExpression =
  | SajPrimitive
  | SajVariable
  | ArithmeticOperation
  | ComparativeOperation
  | Procedure
  | ProcedureCall
  | Conditional
  | Effect;

export type SajProgram = SajExpression | Definition;

// =============================================================================
// Runtime Types
// =============================================================================

export interface ProcedureClosure {
  type: "procedureClosure";
  procedure: Procedure;
  scopedEnvironment: Environment;
}

export type Environment = Record<string, unknown>;

export interface EvalResult {
  result: unknown;
  env: Environment;
}

// =============================================================================
// Validators
// =============================================================================

const VALID_TYPES = [
  "number", "string", "boolean",
  "variable",
  "arithmeticOperation", "comparativeOperation",
  "procedure", "procedureCall",
  "conditional", "definition",
  "effect"
];

export function isValidSajType(obj: unknown): obj is SajProgram {
  if (typeof obj !== "object" || obj === null) return false;
  const typed = obj as Record<string, unknown>;
  if (typeof typed.type !== "string") return false;
  return VALID_TYPES.includes(typed.type);
}

export function validateProgram(program: unknown): { valid: boolean; error?: string } {
  try {
    if (!isValidSajType(program)) {
      return { valid: false, error: "Invalid SAJ type structure" };
    }
    // Deep validation would go here
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}
