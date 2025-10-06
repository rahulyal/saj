import { tokenizer } from "./tokenizer.js";
import { parser } from "./parser.js";
import { isValidProgram } from "./types.js";

// const KVStore = {}; // GLOBAL SCOPE

// we are moving away from global scope of kv store to keep the core purely functional
// still needs to be updated to deal with operands array instead of left and right

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
    return { result: expression.value, KvEnv };
  } else if (expression.type === "variable") {
    const keyName = expression.key;
    // console.log("Looking up:", keyName, "found:", KVStore[keyName]);
    return { result: KvEnv[keyName], KvEnv };
  } else if (expression.type === "definition") {
    const keyName = expression.key.key;
    KvEnv[keyName] = expression.value;
    // console.log("Stored:", keyName, "=", KVStore[keyName]);
    return { result: null, KvEnv };
  } else if (expression.type === "procedure") {
    return `#<${expression.type}> \n inputs: ${expression.inputs} \n body: ${expression.body}`;
  } else if (expression.type === "operation") {
    // console.log(expression);
    let left = null;
    let right = null;
    switch (expression.op) {
      case "+":
        return expression.operands
          .map((operand) => {
            const { result, KvEnv } = evaluate(operand, KvEnv);
            return result;
          })
          .reduce((acc, curr) => acc + curr, 0);
      case "-":
        return expression.operands
          .map(evaluate)
          .reduce((acc, curr) => acc - curr);
      case "*":
        return expression.operands
          .map(evaluate)
          .reduce((acc, curr) => acc * curr, 1);
      case "/":
        return expression.operands
          .map(evaluate)
          .reduce((acc, curr) => acc / curr);
      case "=":
        left = evaluate(expression.operands[0]);
        right = evaluate(expression.operands[1]);
        return {
          type: "boolean",
          value: left === right,
        };
      case ">":
        left = evaluate(expression.operands[0]);
        right = evaluate(expression.operands[1]);
        return {
          type: "boolean",
          value: left > right,
        };
      case "<":
        left = evaluate(expression.operands[0]);
        right = evaluate(expression.operands[1]);
        return {
          type: "boolean",
          value: left < right,
        };
    }
  } else if (expression.type === "procedure_call") {
    const func = KVStore[expression.func_name.key];
    // make the function for the actual function, and apply args with it, and handle errors
    const inputs = func.inputs;
    const funcExpression = func.body;
    let savedValues = {};
    inputs.map((e, i) => {
      savedValues[e] = KVStore[e];
      KVStore[e] = evaluate(expression.args[i]);
    });
    // console.log(KVStore, savedValues);
    const res = evaluate(funcExpression);
    inputs.map((e) => (KVStore[e] = savedValues[e]));
    return res;
  } else if (expression.type === "conditional") {
    const condition = evaluate(expression.condition);
    if (condition.value) {
      return evaluate(expression.true_return);
    } else {
      return evaluate(expression.false_return);
    }
  }
};

const repl = () => {
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
        const result = evaluate(validated);
        if (result !== null) console.log(result);
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
