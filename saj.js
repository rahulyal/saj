import {
	tokenizer
} from "./tokenizer.js";
import {
	parser
} from "./parser.js";
import {
	isValidProgram
} from "./types.js"
/**
Primitive Data types:

[-] number, string
[-] booleans

type expression = procedure | definition | variable | operation | procedure_call

type variable = {
	type: "variable",
	key: string
}

type operation = {
	type: "operation",
	op: string    // ["+","-","*","/"];
	operands: []  // this used to be previously left and right
}

type definition = {
	type: "definition",
	key: variable,
	value: expression - either an operation or a procedure or a value
}

type procedure = {
	type: "procedure";
	inputs: [];
	body: expression;
}

type procedure_call = {
	type: "procedure_call";
	func_name: variable;
	args: [];
	return_value: expression
}

type conditional = {
	type: "conditional",
	condition: expression, // this should have a truth value
	true_return: expression,
	false_return: expression
}
*/
const KVStore = {}; // GLOBAL SCOPE

// still needs to be updated to deal with operands array instead of left and right
const evaluate = (expression) => {
	if (typeof expression === "number" || typeof expression === "string") {
		return expression
	} else if (expression.type === "operation") {
		// console.log(expression);
		let left = null;
		let right = null;
		switch (expression.op) {
			case "+":
				return expression.operands.map(evaluate).reduce(((acc, curr) => acc + curr), 0);
			case "-":
				return expression.operands.map(evaluate).reduce((acc, curr) => acc - curr);
			case "*":
				return expression.operands.map(evaluate).reduce(((acc, curr) => acc * curr), 1);
			case "/":
				return expression.operands.map(evaluate).reduce((acc, curr) => acc / curr);
			case "=":
				left = evaluate(expression.operands[0]);
				right = evaluate(expression.operands[1]);
				return {
					type: "boolean",
						value: (left === right)
				};
			case ">":
				left = evaluate(expression.operands[0]);
				right = evaluate(expression.operands[1]);
				return {
					type: "boolean",
						value: (left > right)
				};
			case "<":
				left = evaluate(expression.operands[0]);
				right = evaluate(expression.operands[1]);
				return {
					type: "boolean",
						value: (left < right)
				};
		}
	} else if (expression.type === "definition") {
		const keyName = expression.key.key;
		KVStore[keyName] = expression.value;
		// console.log("Stored:", keyName, "=", KVStore[keyName]);
		return null;
	} else if (expression.type === "variable") {
		const keyName = expression.key;
		// console.log("Looking up:", keyName, "found:", KVStore[keyName]);
		return KVStore[keyName];
	} else if (expression.type === "procedure") {
		return `#<${expression.type}> \n inputs: ${expression.inputs} \n body: ${expression.body}`;
	} else if (expression.type === "procedure_call") {
		const func = KVStore[expression.func_name.key];
		// make the function for the actual function, and apply args with it, and handle errors
		const inputs = func.inputs;
		const funcExpression = func.body;
		let savedValues = {};
		inputs.map((e, i) => {
			savedValues[e] = KVStore[e];
			KVStore[e] = evaluate(expression.args[i]);
		})
		// console.log(KVStore, savedValues);
		const res = evaluate(funcExpression);
		inputs.map((e) => KVStore[e] = savedValues[e]);
		return res;
	} else if (expression.type === "boolean") {
		return expression.value;
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
				console.error("type validation failed: structural")
			}
		} catch (e) {
			console.error(e.message);
		}
	}
}

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
