/**
Type validation functions
- structural currently working on
- evaluator to FP next with scoped environments
- syntax based parsing errors
COMPLETE error handling for foundational layer

Primitive Data types:

[-] number, string
[-] booleans

type number = {
	type: "number", (string innately - type property in all types are jsut strings similar to js's typeof but better without stupid bugs)
	value: number
}

type string = {
	type: "string",
	value: string
}

type boolean = {
	type: "boolean",
	value: boolean
}

type expression = variable | operation | procedure_call | conditional | primitiveData

type special_expressions = procedure | definition

type variable = {
	type: "variable",
	key: string
}

// this would be evaluated to usually one of the primitive types
type operation = {
	type: "operation",
	op: string    // ["+","-","*","/",">","<","="];
	operands: []  // this used to be previously left and right
	/////// expressions - every operand is an expression type - not every primitiveData though, for now only numbers
}

type definition = {
	type: "definition",
	key: variable,
	value: expression - can be anything except another definition currently supported types
}

// procedure is either definable or callable that is it
// basically procedures can't be evaluated to something, they can be defined and passed around as variables though
// should we explore a procedure to be a special type of variable idk
type procedure = {
	type: "procedure";
	inputs: []; - these are just strings
	body: expression; - expression or another procedure too actually, 
// not a definition for now, actually can be a functionally scoped definition as well moving towards FP shift, but idk
// check scheme implementation if you want internal definitions
}

type procedure_call = {
	type: "procedure_call";
	func_name: variable; // this can just be a string - nope can't be
	args: []; expression - each arg
	return_value: from parser this is always null needn't even check this, this is evaluators problem (removed)
////// we are not even storing this return value inevaluator maybe for memoizing the procedure calls result for certain args would work, not unncecessary
}

type conditional = {
	type: "conditional",
	condition: expression, // this should have a truth value - but that is evaluator's problem
	true_return: expression,
	false_return: expression
}

fun facts:
In JavaScript, everything that's not a primitive is an object:
Primitives: undefined(uninitiated variable), null, numeric, string, boolean, object, symbols
Arrays are objects with numeric indices
Functions are objects that can be called
Dates are objects
RegExp are objects
Even new String() creates objects
*/

//////////////////////////////////////////////////////////////
//// Primitive types supported
//// - string, number, boolean
//// - known bug NaN in JS is still a number
//// - as for the objects, typeof null, and arrays being objects as well
//// - and not to go over the hassle of all this functions handled in js
//// - I want everything else to be a object that I can future proof for JSON like

// export const isString = (x) => typeof x === "string";
// export const isNumber = (x) => typeof x === "number";
// export const isBoolean = (x) => typeof x === "boolean";

/////////////////////////////////////////////////////////////
//// Everything else is JSON like objects with type
//// Make every type a JSON structure for consistency and type validations for all types can be simply encapsulated

// const isObjectWithType = (x) => typeof x === "object" && x !== null && !Array.isArray(x) && typeof x.type === "string";

/**
helper check functions for all sajTypes
checks if a sajType is valid
input: sajType
output: boolean
*/
// const validType = {
// 	number: (x) => isObjectWithType(x) && x.type === "number" && typeof x.value === "number" && !isNaN(x.value) && isFinite(x.value),
// 	string: (x) => isObjectWithType(x) && x.type === "string" && typeof x.value === "string",
// 	boolean: (x) => isObjectWithType(x) && x.type === "boolean" && typeof x.value === "boolean",
// 	variable: (x) => isObjectWithType(x) && x.type === "variable" && typeof x.key === "string",
// 	operation: (x) => {
// 		if (isObjectWithType(x) && x.type === "operation") {
//
// 		}
// 	}
// }

/**
checks if the object is a validExpression
*/
// const isValidExpression () => {
//
// }

// this is just so boring
// I want to write everything in purely functional paradigm of js

//////////////////////////////////////////////////////////////////////////

// break everything down to the smallest atom functions and use higher order functions to build up

// fuck everything just focus on number type

const isObject = (x) => typeof x === "object";
const isNull = (x) => x === null;
const isArray = (x) => Array.isArray(x);
const isNum = (x) => typeof x === "number";
const isString = (x) => typeof x === "string";
const hasTypeProperty = (x) => Object.hasOwn(x, "type") && typeof x.type === "string";

// this shit never works in js, 
// const isNaN = (x) => x === NaN;

const isValidSajTypeObjectStructure = (x) => isObject(x) && !isNull(x) && !isArray(x) && hasTypeProperty(x);

// const isType = (expectedType) => {
// 	return (
// 		(sajTypeObject) => {
// 			return sajTypeObject.type === expectedType;
// 		}
// 	)
// }

const isNumValueValid = (x) => {
	return isNum(x) && !Number.isNaN(x) && isFinite(x);
}

// const isNumber = (sajTypeObject) => {
// 	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
// 	const typeChecker = isType("number"); /////////
// 	if (isValidObject && typeChecker(sajTypeObject)) {
// 		const numValue = sajTypeObject.value;
// 		return isNumValueValid(numValue); /////////
// 	}
// 	return false;
// }

// Should return true
// console.log(isNumber({ type: "number", value: 42 }));
//
// console.log(isNumber({ type: "number", value: NaN }));
// console.log(isNumber({ type: "string", value: "hello" }));
// console.log(isNumber(null));
// console.log(isNumber(42));
// Should return false

const isStringValueValid = (x) => {
	return typeof x === "string";
}

// const isString = (sajTypeObject) => {
// 	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
// 	const typeChecker = isType("string"); ///////////
// 	if (isValidObject && typeChecker(sajTypeObject)) {
// 		const stringValue = sajTypeObject.value;
// 		return isStringValueValid(stringValue); /////////
// 	}
// 	return false;
// }

const isBooleanValueValid = (x) => {
	return typeof x === "boolean";
}

// const isBoolean = (sajTypeObject) => {
// 	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
// 	const typeChecker = isType("boolean"); ///////////
// 	if (isValidObject && typeChecker(sajTypeObject)) {
// 		const stringValue = sajTypeObject.value;
// 		return isBooleanValueValid(stringValue); //////////
// 	}
// 	return false;
// }

///////////////////////////////////////////////////////
// we can create a validator function that would take in the typeString, and 
// the sajTypeObject itself (which would contain the type and value)

const createPrimitiveTypeValidator = (typeString, valueValidatorFn) => {
	const validator = (sajTypeObject) => {
		// check if this is an ObjectWithType
		const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
		if (!isValidObject) return false
		// check for type match
		if (sajTypeObject.type === typeString) {
			// validate the value based on the typeString ?
			// valueValidatorFn should always return a boolean
			if (!Object.hasOwn(sajTypeObject, "value")) return false;
			return valueValidatorFn(sajTypeObject.value);
		}
		return false;
	};
	return validator;
}

// const isBoolean = (sajTypeObject) => {
//
// 	const booleanValidatorFn = createValidator("boolean", isBooleanValueValid);
//
// 	// const typeChecker = isType("boolean"); ///////////
// 	// if (isValidObject) {
// 	return booleanValidatorFn(sajTypeObject)
// 		// return isBooleanValueValid(stringValue); //////////
// 	// }
// }

///////////////////////////////////////////////////////
// these functions take in the sajTypeObject as the input
// PRIMITIVE data type validations
// isBoolean is a function with
// input: sajTypeObject
// output: boolean

const isSajBoolean = createPrimitiveTypeValidator("boolean", isBooleanValueValid);
const isSajString = createPrimitiveTypeValidator("string", isStringValueValid);
const isSajNumber = createPrimitiveTypeValidator("number", isNumValueValid);

const isPrimitive = (sajTypeObject) => isSajBoolean(sajTypeObject) || isSajString(sajTypeObject) || isSajNumber(sajTypeObject);

///////////////////////////////////////////////////////
// writing expression type validations
// the dumb way first
// then find patterns and abstract using FP paradigm

const isVariable = (sajTypeObject) => {
	// check if it is a valid object with Type
	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
	if (!isValidObject) return false;
	const {
		type,
		key
	} = sajTypeObject;
	// check if the type is variable and the value is string
	if (type === "variable" && typeof key === "string") return true;
	return false;
}

// can destructure the sajTypeObject to the object of that specific type
// sajTypeObject replaced with {type,op,operands}
const isOperation = (sajTypeObject) => {
	// check if it is a valid object with Type
	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
	if (!isValidObject) return false;
	if (!Object.hasOwn(sajTypeObject, "op") || !Object.hasOwn(sajTypeObject, "operands")) return false;
	const {
		type,
		op,
		operands
	} = sajTypeObject;
	if (type !== "operation") return false;
	// check op property
	const operations = ["+", "-", "*", "/", "<", ">", "="];
	const comparisonOperators = [">", "<", "="];
	if (operations.includes(op)) {
		// check operands array
		if (operands.length < 2) return false;
		// currently the comparative operations >,<,=
		// only can process 2 operands which I will modify in evaluation to deal with multiple args
		// if that was not the case should we do this operands length based error handling within parser logic ?
		// because parser handles syntaxErrors, and this is separation of concerns to just type validation.
		// parser just creates the parsed JSON data objects which are sajTypeObjects
		// syntax errors like not closing params or something like that would be handled in parser
		if (comparisonOperators.includes(op) && operands.length > 2) return false;
		// wait operands themselves should either be operations or numbers
		// we can use map to check if every operand is an operation or a number
		// then we reduce it to boolean value, if false return false
		// This is recursively checkin for internal operands to be accepted of these types
		return operands.every((operand) => isOperation(operand) || isSajNumber(operand) || isVariable(operand) || isProcedureCall(operand) || isConditional(operand));
	}
	return false;
}

const isDefinition = (sajTypeObject) => {
	// check if it is a valid object with Type
	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
	if (!isValidObject) return false;
	if (!Object.hasOwn(sajTypeObject, "key") || !Object.hasOwn(sajTypeObject, "value")) return false;
	// destructure for ease
	const {
		type,
		key,
		value
	} = sajTypeObject;
	// check type
	if (type !== "definition") return false;
	// check if key is a variable
	if (!isVariable(key)) return false;
	// check if the value is either an operation or a primitive type
	if (isExpression(value) || isProcedure(value)) return true;
	return false;
}

const isProcedure = (sajTypeObject) => {
	// check if it is a valid object with Type
	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
	if (!isValidObject) return false;
	// validate all properties exist
	if (!Object.hasOwn(sajTypeObject, "inputs") || !Object.hasOwn(sajTypeObject, "body")) return false;
	// destructure for ease
	const {
		type,
		inputs,
		body
	} = sajTypeObject;
	// check type
	if (type !== "procedure") return false;
	if (!isArray(inputs)) return false;
	// check if every input is a string
	if (!inputs.every(isString)) return false;
	const isValidBody = isValidSajTypeObjectStructure(sajTypeObject.body);
	if (!isValidBody) return false;
	if (!isExpression(body) && !isProcedure(body)) return false;
	// still not recursively completely validating all the cases the body expression can be
	return true;
}

const isProcedureCall = (sajTypeObject) => {
	// check if it is a valid object with Type
	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
	if (!isValidObject) return false;
	// validate all properties exist
	if (!Object.hasOwn(sajTypeObject, "func_name") || !Object.hasOwn(sajTypeObject, "args") || !Object.hasOwn(sajTypeObject, "return_value")) return false;
	// destructure for ease
	const {
		type,
		func_name,
		args,
		return_value
	} = sajTypeObject;
	if (type !== "procedure_call") return false;
	if (!isVariable(func_name)) return false;
	if (!isArray(args)) return false;
	// if (return_value !== null) return false;
	if (!args.every(isExpression)) return false
	return true;
}

const isConditional = (sajTypeObject) => {
	// check if it is a valid object with Type
	const isValidObject = isValidSajTypeObjectStructure(sajTypeObject);
	if (!isValidObject) return false;
	// validate all properties exist
	if (!Object.hasOwn(sajTypeObject, "condition") || !Object.hasOwn(sajTypeObject, "true_return") || !Object.hasOwn(sajTypeObject, "false_return")) return false;
	// destructure for ease
	const {
		type,
		condition,
		true_return,
		false_return
	} = sajTypeObject;
	if (type !== "conditional") return false;
	// condition can be an expression but should finally evaluate to a boolean
	const isValidCondition = isValidSajTypeObjectStructure(sajTypeObject.condition) && isExpression(sajTypeObject.condition);
	const isValidTrueReturn = isValidSajTypeObjectStructure(sajTypeObject.true_return) && isExpression(sajTypeObject.true_return);
	const isValidFalseReturn = isValidSajTypeObjectStructure(sajTypeObject.false_return) && isExpression(sajTypeObject.false_return);
	if (!isValidCondition || !isValidTrueReturn || !isValidFalseReturn) return false;
	return true;
}

const isExpression = (sajTypeObject) => isPrimitive(sajTypeObject) || isVariable(sajTypeObject) || isOperation(sajTypeObject) || isProcedureCall(sajTypeObject) || isConditional(sajTypeObject);
export const isValidProgram = (x) => isExpression(x) || isProcedure(x) || isDefinition(x);