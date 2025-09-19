const evaluate = (expression) => {
	if (typeof expression === "number" || typeof expression === "string") {
		// console.log(expression);
		return expression
	} else if (expression.type === "operation") {
		switch (expression.op) {
			case "+":
				return evaluate(expression.left) + evaluate(expression.right)
			case "-":
				return evaluate(expression.left) - evaluate(expression.right)
			case "*":
				return evaluate(expression.left) * evaluate(expression.right)
			case "/":
				return evaluate(expression.left) / evaluate(expression.right)
		}
	}
};

/**
Tokenizer: turns strings into meaningful tokens that can be parsed
input: string
output: Token[] -> Token : string  

(+ 7 8)
*/
const tokenizer = (readline) => {
	let tokens = [];
	let token = "";
	for (let i = 0; i < readline.length; i++) {
		token += readline[i];
		if (readline[i] === "(" || readline[i] === ")") {
			if (readline[i] === ")") {
				if (token.length > 1) {
					tokens.push(token.slice(0, -1))
					tokens.push(")")
					token = ""
				}
			} else {
				tokens.push(token);
				token = "";
			}
		} else if (readline[i] === " ") {
			if (token) {
				// let us not worry about parsing, just stick to tokenizing into meaningful strings
				// even if strings or numbers, not the tokenizers job, just put the string into readable
				// data chunks that can be parsed and evaluated later on
				// const num = parseFloat(token);
				// if (num === !NaN) {
				//
				// }
				tokens.push(token.slice(0,-1))
				token = ""
			}
		}
	}
	if (token) {
		tokens.push(token)
	}
	return tokens
}

// string must be processed like this in scheme interpretor find the reason behind the decision
// const expression1 = '"test"';
// const expression = "(+ 2 3)"
// console.log(tokenizer(expression));

/**
Parser -> reads the tokens (Token[]), which are just strings still, 
but in meaningful parsable sense

-- even this is fucking complex 
type ParsedToken = {
	value: string | number;
	type: "LPAREN" | "SYMBOL" | "NUMBER" | "RPAREN" | "STRING" ;
}
-- just simply based on the structure of the initial draft (+ 2 3 ) => 
let us get this case to work first, 
- always solve the most simple problem case first
- then go on until you solve every other case

*/
const parser = (tokens) => {
	// OLD PARSER - for basic string and number case
	// console.log(readline);
	// const num = parseFloat(readline);
	// if (readline.startsWith("(") && readline.endsWith(")")) {
	// 	processProcedure(readline);
	// } else if (readline.startsWith('"') && readline.endsWith('"')) {
	// 	return readline;
	// } else if (!isNaN(num)) {
	// 	return num;
	// }
	// Now should parse tokens into parsedTokens first, and then make meaning of the complete expression
	// fuck that feels complex as hell
	if (tokens[0] === "(") {
		switch (tokens[1]) {
		case "+":
		case "-":
		case "*":
		case "/":
			const parsed = {
				type: "operation",
				op: tokens[1],
				left: tokens[2],
				right: tokens[3]
			}
			// console.log(parsed);
			return parsed
		}
		
	} else {
		const fullToken = tokens.join("");
		// console.log(fullToken);
		const num = parseFloat(fullToken)
		if (!isNaN(num)) {
			return num
		} else {
			return fullToken
		}
	}
};

// const tokens = [ "(", "+", "2", "3", ")" ]
// const tokens1 = [ "2", "3", "4" ]
// console.log(parser(tokens1));


const repl = () => {
	while (true) {
		const input = prompt("> ");
		// exit should soon be only a procedure, and how do you call a procedure
		if (input === "exit") break;

		try {
			const tokens = tokenizer(input);
			const parsed = parser(tokens);
			const result = evaluate(parsed);
			console.log(result);
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
