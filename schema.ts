import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// ///////////////////////////////////////////////////////////////////////////
// Primitive Types
// ///////////////////////////////////////////////////////////////////////////

export const SajNumber = z.object({
  type: z.literal("number"),
  value: z.number().finite(),
});

export const SajString = z.object({
  type: z.literal("string"),
  value: z.string(),
});

export const SajBoolean = z.object({
  type: z.literal("boolean"),
  value: z.boolean(),
});

export const SajPrimitive = z.discriminatedUnion("type", [
  SajNumber,
  SajString,
  SajBoolean,
]);

// ///////////////////////////////////////////////////////////////////////////
// Variable Reference
// ///////////////////////////////////////////////////////////////////////////

export const SajVariable = z.object({
  type: z.literal("variable"),
  key: z.string(),
});

// ///////////////////////////////////////////////////////////////////////////
// Forward declarations for recursive types
// We use z.lazy() to handle mutual recursion
// ///////////////////////////////////////////////////////////////////////////

export type SajExpression = z.infer<typeof SajExpression>;
export type SajArithmeticOperation = z.infer<typeof SajArithmeticOperation>;
export type SajComparativeOperation = z.infer<typeof SajComparativeOperation>;
export type SajProcedure = z.infer<typeof SajProcedure>;
export type SajProcedureCall = z.infer<typeof SajProcedureCall>;
export type SajConditional = z.infer<typeof SajConditional>;
export type SajDefinition = z.infer<typeof SajDefinition>;
export type SajEffect = z.infer<typeof SajEffect>;
export type SajList = z.infer<typeof SajList>;
export type SajListOperation = z.infer<typeof SajListOperation>;

// ///////////////////////////////////////////////////////////////////////////
// Effects - The new system for side effects
// ///////////////////////////////////////////////////////////////////////////

// KV Operations
const KvGet = z.object({
  type: z.literal("effect"),
  action: z.literal("kv:get"),
  key: z.string(),
});

const KvSet = z.object({
  type: z.literal("effect"),
  action: z.literal("kv:set"),
  key: z.string(),
  value: z.lazy(() => SajExpression),
});

const KvDelete = z.object({
  type: z.literal("effect"),
  action: z.literal("kv:delete"),
  key: z.string(),
});

const KvList = z.object({
  type: z.literal("effect"),
  action: z.literal("kv:list"),
  prefix: z.string().optional(),
});

// HTTP Operations
const FetchEffect = z.object({
  type: z.literal("effect"),
  action: z.literal("fetch"),
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.lazy(() => SajExpression).optional(),
});

// Logging/Output
const LogEffect = z.object({
  type: z.literal("effect"),
  action: z.literal("log"),
  message: z.lazy(() => SajExpression),
});

// Sequence - run multiple effects in order
const SequenceEffect = z.object({
  type: z.literal("effect"),
  action: z.literal("sequence"),
  steps: z.array(z.lazy(() => SajExpression)),
});

// Let binding - bind effect result to a variable for subsequent expressions
const LetEffect = z.object({
  type: z.literal("effect"),
  action: z.literal("let"),
  binding: z.string(),
  value: z.lazy(() => SajExpression),
  body: z.lazy(() => SajExpression),
});

// All effect types
export const SajEffect = z.discriminatedUnion("action", [
  KvGet,
  KvSet,
  KvDelete,
  KvList,
  FetchEffect,
  LogEffect,
  SequenceEffect,
  LetEffect,
]);

// ///////////////////////////////////////////////////////////////////////////
// Lists - First-class list support for math operations
// ///////////////////////////////////////////////////////////////////////////

// List literal - a list of expressions
export const SajList: z.ZodType<{
  type: "list";
  elements: SajExpression[];
}> = z.object({
  type: z.literal("list"),
  elements: z.lazy(() => z.array(SajExpression)),
});

// List operations
const ListSum = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("sum"),
  list: z.lazy(() => SajExpression),
});

const ListLength = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("length"),
  list: z.lazy(() => SajExpression),
});

const ListHead = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("head"),
  list: z.lazy(() => SajExpression),
});

const ListTail = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("tail"),
  list: z.lazy(() => SajExpression),
});

const ListNth = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("nth"),
  list: z.lazy(() => SajExpression),
  index: z.lazy(() => SajExpression),
});

const ListConcat = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("concat"),
  lists: z.array(z.lazy(() => SajExpression)),
});

const ListRange = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("range"),
  start: z.lazy(() => SajExpression),
  end: z.lazy(() => SajExpression),
  step: z.lazy(() => SajExpression).optional(),
});

const ListMap = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("map"),
  list: z.lazy(() => SajExpression),
  procedure: z.lazy(() => z.union([SajVariable, SajProcedure])),
});

const ListFilter = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("filter"),
  list: z.lazy(() => SajExpression),
  predicate: z.lazy(() => z.union([SajVariable, SajProcedure])),
});

const ListReduce = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("reduce"),
  list: z.lazy(() => SajExpression),
  procedure: z.lazy(() => z.union([SajVariable, SajProcedure])),
  initial: z.lazy(() => SajExpression),
});

const ListProduct = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("product"),
  list: z.lazy(() => SajExpression),
});

const ListMin = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("min"),
  list: z.lazy(() => SajExpression),
});

const ListMax = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("max"),
  list: z.lazy(() => SajExpression),
});

const ListAverage = z.object({
  type: z.literal("listOperation"),
  operation: z.literal("average"),
  list: z.lazy(() => SajExpression),
});

// All list operations
export const SajListOperation = z.discriminatedUnion("operation", [
  ListSum,
  ListLength,
  ListHead,
  ListTail,
  ListNth,
  ListConcat,
  ListRange,
  ListMap,
  ListFilter,
  ListReduce,
  ListProduct,
  ListMin,
  ListMax,
  ListAverage,
]);

// ///////////////////////////////////////////////////////////////////////////
// Operations
// ///////////////////////////////////////////////////////////////////////////

// Arithmetic operand - can be number, variable, nested arithmetic, procedure call, conditional, or effect
const ArithmeticOperand: z.ZodType<
  | z.infer<typeof SajNumber>
  | z.infer<typeof SajVariable>
  | SajArithmeticOperation
  | SajProcedureCall
  | SajConditional
  | SajEffect
> = z.lazy(() =>
  z.union([
    SajNumber,
    SajVariable,
    SajArithmeticOperation,
    SajProcedureCall,
    SajConditional,
    SajEffect,
  ])
);

export const SajArithmeticOperation: z.ZodType<{
  type: "arithmeticOperation";
  operation: "+" | "-" | "*" | "/";
  operands: Array<
    | z.infer<typeof SajNumber>
    | z.infer<typeof SajVariable>
    | SajArithmeticOperation
    | SajProcedureCall
    | SajConditional
    | SajEffect
  >;
}> = z.object({
  type: z.literal("arithmeticOperation"),
  operation: z.enum(["+", "-", "*", "/"]),
  operands: z.array(ArithmeticOperand),
});

// Comparative operand - similar to arithmetic but also allows comparative operations
const ComparativeOperand: z.ZodType<
  | z.infer<typeof SajNumber>
  | z.infer<typeof SajVariable>
  | SajArithmeticOperation
  | SajComparativeOperation
  | SajProcedureCall
  | SajConditional
  | SajEffect
> = z.lazy(() =>
  z.union([
    SajNumber,
    SajVariable,
    SajArithmeticOperation,
    SajComparativeOperation,
    SajProcedureCall,
    SajConditional,
    SajEffect,
  ])
);

export const SajComparativeOperation: z.ZodType<{
  type: "comparativeOperation";
  operation: ">" | "=" | "<" | ">=" | "<=" | "!=";
  operands: Array<
    | z.infer<typeof SajNumber>
    | z.infer<typeof SajVariable>
    | SajArithmeticOperation
    | SajComparativeOperation
    | SajProcedureCall
    | SajConditional
    | SajEffect
  >;
}> = z.object({
  type: z.literal("comparativeOperation"),
  operation: z.enum([">", "=", "<", ">=", "<=", "!="]),
  operands: z.array(ComparativeOperand),
});

// ///////////////////////////////////////////////////////////////////////////
// Procedures
// ///////////////////////////////////////////////////////////////////////////

export const SajProcedure: z.ZodType<{
  type: "procedure";
  inputs: string[];
  body: SajExpression;
}> = z.object({
  type: z.literal("procedure"),
  inputs: z.array(z.string()),
  body: z.lazy(() => SajExpression),
});

export const SajProcedureCall: z.ZodType<{
  type: "procedureCall";
  procedure: z.infer<typeof SajVariable> | SajProcedure;
  arguments: SajExpression[];
}> = z.object({
  type: z.literal("procedureCall"),
  procedure: z.lazy(() => z.union([SajVariable, SajProcedure])),
  arguments: z.lazy(() => z.array(SajExpression)),
});

// ///////////////////////////////////////////////////////////////////////////
// Conditional
// ///////////////////////////////////////////////////////////////////////////

export const SajConditional: z.ZodType<{
  type: "conditional";
  condition: SajExpression;
  trueReturn: SajExpression;
  falseReturn: SajExpression;
}> = z.object({
  type: z.literal("conditional"),
  condition: z.lazy(() => SajExpression),
  trueReturn: z.lazy(() => SajExpression),
  falseReturn: z.lazy(() => SajExpression),
});

// ///////////////////////////////////////////////////////////////////////////
// Definition (top-level only)
// ///////////////////////////////////////////////////////////////////////////

export const SajDefinition: z.ZodType<{
  type: "definition";
  key: z.infer<typeof SajVariable>;
  value: SajExpression;
}> = z.object({
  type: z.literal("definition"),
  key: SajVariable,
  value: z.lazy(() => SajExpression),
});

// ///////////////////////////////////////////////////////////////////////////
// Complete Expression Type
// ///////////////////////////////////////////////////////////////////////////

export const SajExpression: z.ZodType<
  | z.infer<typeof SajNumber>
  | z.infer<typeof SajString>
  | z.infer<typeof SajBoolean>
  | z.infer<typeof SajVariable>
  | SajArithmeticOperation
  | SajComparativeOperation
  | SajProcedure
  | SajProcedureCall
  | SajConditional
  | SajEffect
  | SajList
  | SajListOperation
> = z.lazy(() =>
  z.union([
    SajNumber,
    SajString,
    SajBoolean,
    SajVariable,
    SajArithmeticOperation,
    SajComparativeOperation,
    SajProcedure,
    SajProcedureCall,
    SajConditional,
    SajEffect,
    SajList,
    SajListOperation,
  ])
);

// ///////////////////////////////////////////////////////////////////////////
// Valid Program (expression or definition)
// ///////////////////////////////////////////////////////////////////////////

export const SajProgram = z.union([SajExpression, SajDefinition]);

// ///////////////////////////////////////////////////////////////////////////
// Program with metadata (for LLM generation)
// ///////////////////////////////////////////////////////////////////////////

export const SajProgramWithMeta = z.object({
  description: z.string().describe("What this program does"),
  program: SajProgram,
});

// ///////////////////////////////////////////////////////////////////////////
// Exported types
// ///////////////////////////////////////////////////////////////////////////

export type SajNumber = z.infer<typeof SajNumber>;
export type SajString = z.infer<typeof SajString>;
export type SajBoolean = z.infer<typeof SajBoolean>;
export type SajPrimitive = z.infer<typeof SajPrimitive>;
export type SajVariable = z.infer<typeof SajVariable>;
export type SajProgram = z.infer<typeof SajProgram>;
export type SajProgramWithMeta = z.infer<typeof SajProgramWithMeta>;
