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
}

const parser = (readline) => {
	// console.log(readline);
	const num = parseFloat(readline);
	if (readline.startsWith('"') && readline.endsWith('"')) {
		return readline;
	} else if (
		!isNaN(num)
	) {
		return num;
	}
}

const repl = () => {
	while (true) {
		const input = prompt("> ");
		// exit should soon be only a procedure, and how do you call a procedure
		if (input === "exit") break;
	
		const parsed = parser(input);
		const result = evaluate(parsed);
	
		console.log(result);
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

