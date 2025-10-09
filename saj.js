import { tokenizer } from "./tokenizer.js";
import { parser } from "./parser.js";
import { isValidProgram } from "./types.js";

// const KVStore = {}; // GLOBAL SCOPE
// we are moving away from global scope of kv store to keep the core purely functional

/**
 *
 * @param {Object} expression
 * @param {Object} KvEnv
 * @returns
 */
const evaluate = (expression, KvEnv) => {
  if (
    expression.type === "number" ||
    expression.type === "string" ||
    expression.type === "boolean"
  ) {
    return { result: expression.value, KvEnv: KvEnv };
  } else if (expression.type === "variable") {
    const keyName = expression.key;
    return { result: KvEnv[keyName], KvEnv: KvEnv };
  } else if (expression.type === "definition") {
    const keyName = expression.key.key;
    const { result, KvEnv: UpdatedEnv } = evaluate(expression.value, KvEnv);
    UpdatedEnv[keyName] = result;
    return { result: null, KvEnv: UpdatedEnv };
  } else if (expression.type === "procedure") {
    // when evaluating a procedure, create a procedureClosure
    const closure = {
      type: "procedureClosure",
      procedure: expression,
      scopedEnvironment: KvEnv,
    };
    return { result: closure, KvEnv: KvEnv };
  }
  // procedure closure is just a VALUE, not an expression
  // It is just created at runtime via procedures
  // else if (expression.type === "procedureClosure") {
  //   return { result: "#procedure", KvEnv: KvEnv };
  else if (expression.type === "arithmeticOperation") {
    let evaluatedOperands = [];
    let results = [];
    switch (expression.operation) {
      case "+":
        evaluatedOperands = expression.operands.map((operand) => {
          const { result, _ } = evaluate(operand, KvEnv);
          return result;
        });
        results = evaluatedOperands.reduce((acc, curr) => acc + curr);
        return { result: results, KvEnv: KvEnv };
      case "-":
        evaluatedOperands = expression.operands.map((operand) => {
          const { result, _ } = evaluate(operand, KvEnv);
          return result;
        });
        results = evaluatedOperands.reduce((acc, curr) => acc - curr);
        return { result: results, KvEnv: KvEnv };
      case "*":
        evaluatedOperands = expression.operands.map((operand) => {
          const { result, _ } = evaluate(operand, KvEnv);
          return result;
        });
        results = evaluatedOperands.reduce((acc, curr) => acc * curr);
        return { result: results, KvEnv: KvEnv };
      case "/":
        evaluatedOperands = expression.operands.map((operand) => {
          const { result, _ } = evaluate(operand, KvEnv);
          return result;
        });
        results = evaluatedOperands.reduce((acc, curr) => acc / curr);
        return { result: results, KvEnv: KvEnv };
    }
  } else if (expression.type === "comparativeOperation") {
    let evaluatedOperands = [];
    let results = [];
    switch (expression.operation) {
      case "=":
        evaluatedOperands = expression.operands.map((operand) => {
          const { result, _ } = evaluate(operand, KvEnv);
          return result;
        });
        results = evaluatedOperands.reduce((acc, curr) => acc === curr);
        return { result: results, KvEnv: KvEnv };
      case ">":
        evaluatedOperands = expression.operands.map((operand) => {
          const { result, _ } = evaluate(operand, KvEnv);
          return result;
        });
        results = evaluatedOperands.reduce((acc, curr) => acc > curr);
        return { result: results, KvEnv: KvEnv };
      case "<":
        evaluatedOperands = expression.operands.map((operand) => {
          const { result, _ } = evaluate(operand, KvEnv);
          return result;
        });
        results = evaluatedOperands.reduce((acc, curr) => acc < curr);
        return { result: results, KvEnv: KvEnv };
    }
  } else if (expression.type === "conditional") {
    // conditional itself would in no way modify the current KvEnv, but
    // internally can have procedure calls which might create new thread scopes
    // but we would worry only about the result of that evaluation
    const { result, _ } = evaluate(expression.condition, KvEnv);
    if (result) {
      return evaluate(expression.trueReturn, KvEnv);
    } else {
      return evaluate(expression.falseReturn, KvEnv);
    }
  } else if (expression.type === "procedureCall") {
    // can either be a procedure itself, or can be a variable that has a value of a procedure
    let procedureClosure;
    if (expression.procedure.type === "variable") {
      // console.log(KvEnv);
      // const procedure = KvEnv[expression.procedure.key];
      // const { result, _ } = evaluate(procedure, KvEnv);
      procedureClosure = KvEnv[expression.procedure.key];
      // console.log(procedureClosure);
    } else if (expression.procedure.type === "procedure") {
      const { result, _ } = evaluate(expression.procedure, KvEnv);
      procedureClosure = result;
    }

    const evaluatedArguments = expression.arguments.map((arg) => {
      const { result, _ } = evaluate(arg, KvEnv);
      return result;
    });
    const localScopedEnvironment = { ...procedureClosure.scopedEnvironment };

    // bind evaluated arguments with inputs in scoped scopedEnvironment
    procedureClosure.procedure.inputs.forEach((input, i) => {
      localScopedEnvironment[input] = evaluatedArguments[i];
    });

    const { result, _ } = evaluate(
      procedureClosure.procedure.body,
      localScopedEnvironment,
    );

    return { result, KvEnv: KvEnv };

    // do we create a new KvEnv simply here ?
    // internal procedural scopes can map the args onto inputs for that scope
    // and kill that scope once the procedure evaluation is done
    //
  }
};

/**
 * An interpretor REPL
 */
const repl = () => {
  let KvEnv = {};
  while (true) {
    const input = prompt("> ");
    // exit should soon be only a procedure, and how do you call a procedure
    if (input === "exit") break;

    try {
      const tokens = tokenizer(input);
      // console.log(tokens);
      const parsed = parser(tokens);
      // console.log(parsed);
      // structural type validation before evaluation
      const validated = isValidProgram(parsed.parsedContent);

      if (validated) {
        const { result, KvEnv: newEnv } = evaluate(parsed.parsedContent, KvEnv);
        KvEnv = newEnv;

        if (result !== null) {
          if (result.type === "procedureClosure") {
            console.log("#<procedure>");
          } else {
            console.log(result);
          }
        }
        // console.log(newEnv);
      } else {
        console.error("type validation failed: structural");
      }
    } catch (e) {
      console.error(e.message);
    }
  }
};

repl();

// parser tests
// const expression3 = '"5+4"';
// const expression4 = '"54"';
// const expression5 = '54';
// console.log(parser(expression3));
// console.log(parser(expression4));
// console.log(parser(expression5));

// evaluate tests
// const expression1 = 42;
// const expression2 = {
// 	type: "operation",
// 	op: "+",
// 	left: {
// 		type: "operation",
// 		op: "+",
// 		left: 3,
// 		right: 7
// 	},
// 	right: 7
// }
// console.log(evaluate(expression1));
// console.log(evaluate(expression2));
