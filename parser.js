///////////////////////////////////////////////////////////////////
//// PARSER
///////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} parsedData
 * @property {(sajExpression | definition)} parsedContent
 * @property {number} nextIndex
 */

/**
 *
 * @param {*} atom
 * @returns {(sajPrimitive | sajVariable)}
 */
const parseAtom = (atom) => {
  const num = parseFloat(atom);
  // console.log(num);
  if (!isNaN(num)) {
    return {
      type: "number",
      value: num,
    };
  } else if (atom.startsWith("#")) {
    if (atom.substring(1) === "true") {
      return {
        type: "boolean",
        value: true,
      };
    } else if (atom.substring(1) === "false") {
      return {
        type: "boolean",
        value: false,
      };
    }
  } else if (atom.startsWith('"') && atom.endsWith('"')) {
    return {
      type: "string",
      value: atom.substring(1, atom.length - 1),
    };
  } else {
    return {
      type: "variable",
      key: atom,
    };
  }
};

/**
 * Parser -> reads the tokens (Token[]) and gives the output as parsedData
 * @param {(string[])} tokens
 * @returns {parsedData} parsedData
 */

export const parser = (tokens, startIndex = 0) => {
  let parsed = {};
  const arithmeticOperations = ["+", "-", "*", "/"];
  const comparativeOperations = [">", "=", "<"];
  // console.log(tokens);
  // const operations = ["+", "-", "*", "/", "<", ">", "="];
  if (tokens[startIndex] !== "(") {
    const parsedAtom = parseAtom(tokens[startIndex]);
    return { parsedContent: parsedAtom, nextIndex: startIndex + 1 };
  } else {
    startIndex += 1;
    const op = tokens[startIndex];
    // console.log(op);
    switch (true) {
      case arithmeticOperations.includes(op):
        // implement how operations must be treated
        parsed = {
          type: "operation",
          op: op,
          operands: [],
        };
        startIndex += 1;
        while (tokens[startIndex] !== ")") {
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.operands.push(parsedContent);
          startIndex = nextIndex;
        }
        return {
          parsedContent: parsed,
          nextIndex: startIndex + 1,
        };
      case comparativeOperations.includes(op):
        // we can do the implementation to deal with multiple args for comparison
        parsed = {
          type: "operation",
          op: op,
          operands: [],
        };
        startIndex += 1;
        while (tokens[startIndex] !== ")") {
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.operands.push(parsedContent);
          startIndex = nextIndex;
        }
        return {
          parsedContent: parsed,
          nextIndex: startIndex + 1,
        };
      case op === "define":
        parsed = {
          type: "definition",
          key: null,
          value: null,
        };
        startIndex += 1;
        if (tokens[startIndex] !== ")") {
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.key = parsedContent;
          startIndex = nextIndex;
        }
        while (tokens[startIndex] !== ")") {
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.value = parsedContent;
          startIndex = nextIndex;
        }
        return {
          parsedContent: parsed,
          nextIndex: startIndex + 1,
        };
      // define
      case op === "lambda":
        // functions
        parsed = {
          type: "procedure",
          inputs: [],
          body: null,
        };
        startIndex += 2;
        while (tokens[startIndex] !== ")") {
          parsed.inputs.push(tokens[startIndex]);
          startIndex += 1;
        }
        startIndex += 1;
        // console.log(parsed, startIndex);
        while (tokens[startIndex] !== ")") {
          // console.log(tokens, startIndex);
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.body = parsedContent;
          // console.log(parsed.body);
          startIndex = nextIndex;
        }
        return {
          parsedContent: parsed,
          nextIndex: startIndex + 1,
        };
      case op === "if":
        //conditional
        parsed = {
          type: "conditional",
          condition: null,
          true_return: null,
          false_return: null,
        };
        startIndex += 1;
        // console.log(parsed,startIndex, tokens);
        while (tokens[startIndex] !== ")") {
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.condition = parsedContent;
          startIndex = nextIndex - 1;
          // console.log("-----\n","parsed:\n",parsed,"startIndex:\n",startIndex, "tokens:\n", tokens, "-----\n");
        }
        startIndex += 1;
        while (tokens[startIndex] !== ")") {
          // console.log("-----", startIndex, "-----");
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.true_return = parsedContent;
          startIndex = nextIndex;
          if (parsed.true_return) {
            break;
          }
          // console.log("-----",parsedContent, startIndex,"-----");
        }
        while (tokens[startIndex] !== ")") {
          const { parsedContent, nextIndex } = parser(tokens, startIndex);
          parsed.false_return = parsedContent;
          startIndex = nextIndex;
          if (parsed.false_return) {
            break;
          }
        }
        // console.log("-----",parsed,startIndex, tokens, "-----");
        return {
          parsedContent: parsed,
          nextIndex: startIndex + 1,
        };

      default:
        // for now using this case as the variable case
        // console.log(op);
        const procedureName = parseAtom(op);
        if (procedureName.type === "variable") {
          parsed = {
            type: "procedureCall",
            procedureName: procedureName,
            arguments: [],
            resultValue: null,
          };

          startIndex += 1;
          // console.log(parsed, startIndex, tokens[startIndex]);
          while (tokens[startIndex] !== ")") {
            const { parsedContent, nextIndex } = parser(tokens, startIndex);
            parsed.arguments.push(parsedContent);
            startIndex = nextIndex;
          }
          return {
            parsedContent: parsed,
            nextIndex: startIndex + 1,
          };
        }
    }
  }
};

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
