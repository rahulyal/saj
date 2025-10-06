//////////////////////////////////////////////////////////////////
//// TOKENIZER
//////////////////////////////////////////////////////////////////

/**
 * Tokenizer: turns strings into meaningful tokens that can be parsed
 * @param {string} input
 * @returns {string[]} tokens

Token cannot contain spaces until it is a string literal " ";
every left paran should be closed with a right paran until in a string literal

- (+ 7 8)
- instead of add token first and decide later approach, we are moving towards a decide first
- only need to decide at lparen, rparen, and spaces, and collect tokens accordingly
*/

export const tokenizer = (input) => {
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
};

//////////////////////////////////////

// string must be processed like this in scheme interpretor find the reason behind the decision
// const expression1 = '"test"';
// const expression1 = "(+ 2 3)"
// const testExpression = "(lambda (x) (* x x))"
// const testExpression = "(define square (lambda (x) (* x x)))"
// console.log(tokenizer(expression1));
