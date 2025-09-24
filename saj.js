/**
Data types:

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
	return: expression
}

type conditional = {
	type: "conditional",
	condition: expression, // this should have a truth value
	trueReturn: expression,
	falseReturn: expression
}
*/
const KVStore = {}; // GLOBAL SCOPE

// still needs to be updated to deal with operands array instead of left and right
const evaluate = (expression) => {
	if (typeof expression === "number" || typeof expression === "string" ) {
		return expression
	} else if (expression.type === "operation") {
		// console.log(expression);
		let left = null;
		let right = null;
		switch (expression.op) {
			case "+":
				return expression.operands.map(evaluate).reduce(((acc, curr) => acc+curr),0);
			case "-":
				return expression.operands.map(evaluate).reduce((acc, curr) => acc-curr);
			case "*":
				return expression.operands.map(evaluate).reduce(((acc, curr) => acc*curr), 1);
			case "/":
				return expression.operands.map(evaluate).reduce((acc, curr) => acc/curr);
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
		inputs.map((e,i)=> {
			savedValues[e] = KVStore[e];
			KVStore[e] = evaluate(expression.args[i]);	
		})
		// console.log(KVStore, savedValues);
		const res = evaluate(funcExpression);
		inputs.map((e)=> KVStore[e] = savedValues[e]);
		return res;
	} else if (expression.type === "boolean") {
		return expression.value;
	} else if (expression.type === "conditional") {
		const condition = evaluate(expression.condition);
		if (condition.value) {
			return evaluate(expression.trueReturn);
		} else {
			return evaluate(expression.falseReturn);
		}
	}
};



//////////////////////////////////////////////////////////////////
//// TOKENIZER
//////////////////////////////////////////////////////////////////

/**
Tokenizer: turns strings into meaningful tokens that can be parsed
input: string
output: Token[] -> Token : string  

Token cannot contain spaces until it is a string literal " ";
every left paran should be closed with a right paran until in a string literal

(+ 7 8)
instead of add token first and decide later approach, we are moving towards a decide first
- only need to decide at lparen, rparen, and spaces, and collect tokens accordingly
*/

const tokenizer = (input) => {
	const inputLength = input.length;
	const tokens = [];
	let token = "";
	for (let i = 0; i < inputLength; i++) {
		let curr = input[i];
		// console.log(token, curr, tokens);
		if (curr === "(" || curr === ")") {
			if (token) {
				tokens.push(token);
				token = "";
			}
			tokens.push(curr);
		} else if (curr === " ") {
			if (token) {
				tokens.push(token);
				token = "";
			}
		} else {
			token += curr;
		}
	}
	if (token) {
		tokens.push(token);
	}
	return tokens;
}


//////////////////////////////////////

// string must be processed like this in scheme interpretor find the reason behind the decision
// const expression1 = '"test"';
// const expression1 = "(+ 2 3)"
// const testExpression = "(lambda (x) (* x x))"
// const testExpression = "(define square (lambda (x) (* x x)))"
// console.log(tokenizer(expression1));

///////////////////////////////////////////////////////////////////
//// PARSER
///////////////////////////////////////////////////////////////////

/**
Parser -> reads the tokens (Token[]) and gives the output as parsedData
input: Token[]
output: parsedData 

type parsedData = {
	parsedContent: Object;
	nextIndex: number
}

*/

const parseAtom = (atom) => {
	const num = parseFloat(atom);
	// console.log(num);
	if (!isNaN(num)) {
		return num;
	} else if (atom.startsWith("#")) {
		if (atom.substring(1) === "true") {
			return {
				type: "boolean",
				value: true
			}
		} else if (atom.substring(1) === "false") {
			return {
				type: "boolean",
				value: false
			}
		}
		
	} else if (atom.startsWith('"') && atom.endsWith('"')) {
		return atom;
	} else {
		return {
			type: "variable",
			key: atom
		}
	}
}

const parser = (tokens, startIndex = 0) => {
	let parsed = {};
	// console.log(tokens);
	const operations = ["+", "-", "*", "/", "<", ">", "="];
	if (tokens[startIndex] !== "(") {
		const parsedAtom = parseAtom(tokens[startIndex]);
		return {parsedContent: parsedAtom, nextIndex: startIndex+1};
	} else {
		startIndex += 1;
		const op = tokens[startIndex];
		// console.log(op);
		switch (true) {
			case operations.includes(op):
				// implement how operations must be treated
				parsed = {
					type: "operation",
					op: op,
					operands: []
				}
				startIndex += 1;
				while (tokens[startIndex] !== ")") {
					const {
						parsedContent,
						nextIndex
					} = parser(tokens, startIndex);
					parsed.operands.push(parsedContent);
					startIndex = nextIndex;
				}
				return {
					parsedContent: parsed, nextIndex: startIndex +1
				};
			case op === "define":
				parsed = {
					type: "definition",
					key: null,
					value: null
				};
				startIndex += 1;
				if (tokens[startIndex] !== ")") {
					const {
						parsedContent,
						nextIndex
					} = parser(tokens, startIndex);
					parsed.key = parsedContent;
					startIndex = nextIndex;
				}
				while (tokens[startIndex] !== ")") {
					const {
						parsedContent,
						nextIndex
					} = parser(tokens, startIndex);
					parsed.value = parsedContent
					startIndex = nextIndex;
				}
				return {
					parsedContent: parsed, nextIndex: startIndex +1
				};
				// define
			case op === "lambda":
				// functions
				parsed = {
					type: "procedure",
					inputs: [],
					body: null
				}
				startIndex += 2;
				while (tokens[startIndex] !== ")") {
					parsed.inputs.push(tokens[startIndex]);
					startIndex += 1;
				}
				startIndex += 1;
				// console.log(parsed, startIndex);
				while (tokens[startIndex] !== ")") {
					// console.log(tokens, startIndex);
					const {
						parsedContent,
						nextIndex
					} = parser(tokens, startIndex);
					parsed.body = parsedContent;
					// console.log(parsed.body);
					startIndex = nextIndex;
				}
				return {
					parsedContent: parsed, nextIndex: startIndex +1
				};
			case op === "if":
				//conditional
				parsed = {
					type: "conditional",
					condition: null,
					trueReturn: null,
					falseReturn: null
				}
				startIndex += 1;
				// console.log(parsed,startIndex, tokens);
				while (tokens[startIndex] !== ")") {
					const {parsedContent, nextIndex} = parser(tokens, startIndex);
					parsed.condition = parsedContent;
					startIndex = nextIndex-1;
					// console.log("-----\n","parsed:\n",parsed,"startIndex:\n",startIndex, "tokens:\n", tokens, "-----\n");
				}
				startIndex += 1
				while (tokens[startIndex] !== ")") {
					// console.log("-----", startIndex, "-----");
					const {parsedContent, nextIndex} = parser(tokens, startIndex);
					parsed.trueReturn = parsedContent;
					startIndex = nextIndex;
					if (parsed.trueReturn) {
						break;
					}
					// console.log("-----",parsedContent, startIndex,"-----");
				}
				while (tokens[startIndex] !== ")") {
					const {parsedContent, nextIndex} = parser(tokens, startIndex);
					parsed.falseReturn = parsedContent;
					startIndex = nextIndex;
					if (parsed.falseReturn) {
						break;
					}
				}
				// console.log("-----",parsed,startIndex, tokens, "-----");
				return {
					parsedContent: parsed, nextIndex: startIndex +1
				};
				
			default:
				// for now using this case as the variable case
				// console.log(op);
				const func_name = parseAtom(op);
				if (func_name.type === "variable") {
					parsed = {
						type: "procedure_call",
						func_name: func_name,
						args : [],
						return_value : null,
					}
					
					startIndex += 1;
					// console.log(parsed, startIndex, tokens[startIndex]);
					while (tokens[startIndex] !== ")") {
						const {parsedContent, nextIndex} = parser(tokens, startIndex);
						parsed.args.push(parsedContent);
						startIndex = nextIndex;
					}
					return {
						parsedContent: parsed,
						nextIndex: startIndex +1
					}
				}
				
		}
	}
}

////////////////////////////////


// const tokens = [ "(", "+", "2", "3", "4","5", ")" ]
// const tokens1 = [ "2", "3", "4" ]
// const tokens = [
//   "(", "lambda",
//   "(", "x",
//   ")", "(",
//   "*", "x",
//   "x", ")",
//   ")"
// ];
// const tokens = [ "test" ]
// const tokens = [
//   "(", "define", "square",
//   "(", "lambda", "(",
//   "x", ")",      "(",
//   "*", "x",      "x",
//   ")", ")",      ")"
// ]
// const tokens = ["(", "define", "x", "3", ")"]
// const tokens = ["(", "+", "2", "(", "*", "3", "4", ")","5", ")"];
// console.log(parser(tokens));
// const tokens = ["(","square","(","+","2","3",")","5",")"];
// console.log(parser(tokens));



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
			const result = evaluate(parsed.parsedContent);
			if (result !== null) console.log(result);
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
