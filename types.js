//@ts-check
/**
 * @fileoverview Type definitions and Validations for saj
 * @author RahulYal [rahul@thetawise.ai]
 */

// /////////////////////////////////////////////////////////////////////////
// Type Definitions
// /////////////////////////////////////////////////////////////////////////

// /////////////////////////////////////////////////////////////////////////
// Primitive Types
/**
 * @typedef {Object} sajNumber
 * @property {"number"} type
 * @property {number} value
 */

/**
 * @typedef {Object} sajString
 * @property {"string"} type
 * @property {string} value
 */

/**
 * @typedef {Object} sajBoolean
 * @property {"boolean"} type
 * @property {boolean} value
 */

/**
 * @typedef {(sajNumber | sajString | sajBoolean)} sajPrimitive
 */

// /////////////////////////////////////////////////////////////////////////
// Expressions
//
/**
 * @typedef {Object} sajVariable
 * @property {"variable"} type
 * @property {string} key
 */

/**
 * @typedef {Object} arithmeticOperation
 * @property {"arithmeticOperation"} type
 * @property { "+" | "-" | "*" | "/" } operation
 * @property {(sajNumber | sajVariable | arithmeticOperation | procedureCall | conditional)[]} operands
 */

/**
 * @typedef {Object} comparisonOperation
 * @property {"comparativeOperation"} type
 * @property { "<" | "=" | ">" } operation
 * @property {(sajNumber | sajVariable | arithmeticOperation | procedureCall | conditional)[]} operands
 */

/**
 * @typedef {(sajPrimitive | sajVariable | arithmeticOperation | comparisonOperation | procedure | procedureCall | conditional)} sajExpression
 */

/**
 * @typedef {Object} procedure
 * @property {"procedure"} type
 * @property {string[]} inputs
 * @property {sajExpression} expression - all expressions except another definition
 */

/**
 * @typedef {Object} procedureCall
 * @property {"procedureCall"} type
 * @property {sajVariable} procedureName
 * @property {sajExpression[]} arguments
 * @property {null} resultValue - every function call even if there is no return
 */

/**
 * @typedef {Object} conditional
 * @property {"conditional"} type
 * @property {sajExpression} condition - evaluates to a boolean
 * @property {sajExpression} trueReturn
 * @property {sajExpression} falseReturn
 */

// /////////////////////////////////////////////////////////////////////////
// Special Expressions

/**
 * @typedef {Object} definition - special expression only root level expression evaluation can handle this keyword
 * @property {"definition"} type
 * @property {sajVariable} key
 * @property {sajExpression} value - everything except another definition
 */

/**
 * @typedef {Object} sajTypeObject - extendable by any other property, although the validators will validate
 * this to be a valid sajTypeObject via property based check
 * @property {string} type
 */

// /////////////////////////////////////////////////////////////////////////
// Atoms - Base JS type validation functions
// x is used for base JS atomics

/**
 * It is known issue in JS that null, and arrays also return object when "typeof" is called.
 * so need to separately check for those typeof cases as well.
 * ref: [https://web.archive.org/web/20160331031419/http://wiki.ecmascript.org:80/doku.php?id=harmony:typeof_null]
 * @param {*} x
 * @returns {boolean}
 */
const isObject = (x) => typeof x === "object";

/**
 *
 * @param {*} x
 * @returns {boolean}
 */
const isNull = (x) => x === null;

/**
 *
 * @param {*} x
 * @returns {boolean}
 */
const isArray = (x) => Array.isArray(x);
/**
 * In JS typeof NaN is also a number, but don't go into this hello hole of figuring out NaN,
 * isNaN was implemented in ECMAScript for this very reason, which we use to check is sajNumber is valid
 * @param {*} x
 * @returns {boolean}
 */
const isNum = (x) => typeof x === "number";

/**
 * Inorder to check the actual numerical value
 * @param {*} x
 * @returns {boolean}
 */
const isNumValueValid = (x) => {
  return isNum(x) && !Number.isNaN(x) && isFinite(x);
};

/**
 *
 * @param {*} x
 * @returns {boolean}
 */
const isStringValueValid = (x) => typeof x === "string";

/**
 *
 * @param {*} x
 * @returns {boolean}
 */
const isBooleanValueValid = (x) => {
  return typeof x === "boolean";
};

/**
 *
 * @param {*} x
 * @returns {boolean}
 */
const hasTypeProperty = (x) =>
  Object.hasOwn(x, "type") && typeof x.type === "string";

// this shit never works in js,
// const isNaN = (x) => x === NaN;

/**
 * Checks if object has EXACTLY the specified keys, no more, no less
 * @param {Object} obj
 * @param {string[]} expectedKeys
 * @returns {boolean}
 */
const hasExactKeys = (obj, expectedKeys) => {
  const objectKeys = Object.keys(obj);
  if (objectKeys.length !== expectedKeys.length) return false;
  return objectKeys.every((objectKey) => expectedKeys.includes(objectKey));
};

// /////////////////////////////////////////////////////////////////////////
// Core saj type validation functions

/**
 *
 * @param {sajTypeObject} sajTypeObject
 * @returns {boolean}
 */
const isValidSajTypeObjectStructure = (sajTypeObject) =>
  isObject(sajTypeObject) &&
  !isNull(sajTypeObject) &&
  !isArray(sajTypeObject) &&
  hasTypeProperty(sajTypeObject);

/**
 * Value validator - checks if a JS primitive value is valid
 * @callback ValueValidator
 * @param {*} value - The primitive JS value to validate
 * @returns {boolean}
 */

/**
 * Type validator - checks if a sajTypeObject is valid
 * @callback TypeValidator
 * @param {*} sajTypeObject
 * @returns {boolean}
 */

/**
 * Higher order function, a type validator function creator for primitive saj data types
 * @param {string} typeString
 * @param {ValueValidator} valueValidatorFn
 * @returns {TypeValidator}
 */
const createPrimitiveTypeValidator = (typeString, valueValidatorFn) => {
  /**
   * @type {TypeValidator}
   */
  const validator = (sajTypeObject) => {
    if (
      isValidSajTypeObjectStructure(sajTypeObject) &&
      hasExactKeys(sajTypeObject, ["type", "value"]) &&
      sajTypeObject.type === typeString
    )
      return valueValidatorFn(sajTypeObject.value);
    return false;
  };
  return validator;
};

const isSajBoolean = createPrimitiveTypeValidator(
  "boolean",
  isBooleanValueValid,
);
const isSajString = createPrimitiveTypeValidator("string", isStringValueValid);
const isSajNumber = createPrimitiveTypeValidator("number", isNumValueValid);

/**
 * Checks if the given sajTypeObject is a primitive type.
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isPrimitive = (sajTypeObject) =>
  isSajBoolean(sajTypeObject) ||
  isSajString(sajTypeObject) ||
  isSajNumber(sajTypeObject);

// /////////////////////////////////////////////////////////////////////////
// saj expression type validation functions

/**
 *
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isVariable = (sajTypeObject) => {
  if (
    hasExactKeys(sajTypeObject, ["type", "key"]) &&
    isValidSajTypeObjectStructure(sajTypeObject)
  ) {
    const { type, key } = sajTypeObject;
    return type === "variable" && typeof key === "string";
  }
  return false;
};

/**
 * Procedure to validate arithmetic operations
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isArithmeticOperation = (sajTypeObject) => {
  const arithmeticOperations = ["+", "-", "*", "/"];
  if (
    hasExactKeys(sajTypeObject, ["type", "operation", "operands"]) &&
    isValidSajTypeObjectStructure(sajTypeObject)
  ) {
    const { type, op, operands } = sajTypeObject;
    if (type !== "operation") return false;
    if (arithmeticOperations.includes(op)) {
      return operands.every(
        /**
         *
         * @param {*} operand
         * @returns {boolean}
         */
        (operand) =>
          isArithmeticOperation(operand) ||
          isSajNumber(operand) ||
          isVariable(operand) ||
          isProcedureCall(operand) ||
          isConditional(operand),
      );
    }
  }
  return false;
};

/**
 * Procedure to validate comparative operations
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isComparitiveOperation = (sajTypeObject) => {
  const comparativeOperations = [">", "=", "<"];
  if (
    hasExactKeys(sajTypeObject, ["type", "operation", "operands"]) &&
    isValidSajTypeObjectStructure(sajTypeObject)
  ) {
    const { type, op, operands } = sajTypeObject;
    if (type !== "operation") return false;
    if (comparativeOperations.includes(op)) {
      // current functionality will only support two operands for comparative operations
      if (operands.length() === 2)
        return operands.every(
          /**
           *
           * @param {*} operand
           * @returns {boolean}
           */
          (operand) =>
            isComparitiveOperation(operand) ||
            isArithmeticOperation(operand) ||
            isSajNumber(operand) ||
            isVariable(operand) ||
            isProcedureCall(operand) ||
            isConditional(operand),
        );
    }
  }
  return false;
};

/**
 * Procedure to validate a definition
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isDefinition = (sajTypeObject) => {
  if (
    hasExactKeys(sajTypeObject, ["type", "key", "value"]) &&
    isValidSajTypeObjectStructure(sajTypeObject)
  ) {
    const { type, key, value } = sajTypeObject;
    if (type !== "definition") return false;
    if (!isVariable(key)) return false;
    // setup this function ocrrectly to clean this comment
    return isExpression(value);
  }
  return false;
};

/**
 * Procedure to validate a procedure
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isProcedure = (sajTypeObject) => {
  if (
    hasExactKeys(sajTypeObject, ["type", "inputs", "body"]) &&
    isValidSajTypeObjectStructure(sajTypeObject)
  ) {
    const { type, inputs, body } = sajTypeObject;
    if (type !== "procedure") return false;
    // inputs check
    if (!isArray(inputs)) return false;
    if (!inputs.every(isStringValueValid)) return false;
    // body expression check - remove comment after making isExpression
    return isExpression(body);
  }
  return false;
};

/**
 * Procedure to validate a procedure call
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isProcedureCall = (sajTypeObject) => {
  if (
    hasExactKeys(sajTypeObject, [
      "type",
      "procedureName",
      "arguments",
      "returnValue",
    ]) &&
    isValidSajTypeObjectStructure(sajTypeObject)
  ) {
    const { type, procedureName, arguments: args, returnValue } = sajTypeObject;
    if (type !== "procedureCall") return false;
    if (!isVariable(procedureName)) return false;
    if (!isArray(args)) return false;
    return args.every(isExpression);
  }
  return false;
};

/**
 *
 * @param {*} sajTypeObject
 * @returns {boolean}
 */
const isConditional = (sajTypeObject) => {
  if (
    hasExactKeys(sajTypeObject, [
      "type",
      "condition",
      "trueReturn",
      "falseReturn",
    ]) &&
    isValidSajTypeObjectStructure(sajTypeObject)
  ) {
    const { type, condition, trueReturn, falseReturn } = sajTypeObject;
    if (type !== "conditional") return false;
    return (
      isExpression(condition) ||
      isExpression(trueReturn) ||
      isExpression(falseReturn)
    );
  }
  return false;
};

/**
 * Procedure to validate all saj Expression types except definition
 * @param {*} sajExpression
 * @returns {boolean}
 */
const isExpression = (sajExpression) =>
  isPrimitive(sajExpression) ||
  isVariable(sajExpression) ||
  isArithmeticOperation(sajExpression) ||
  isComparitiveOperation(sajExpression) ||
  isProcedure(sajExpression) ||
  isProcedureCall(sajExpression) ||
  isConditional(sajExpression);

/**
 *
 * @param {(sajExpression | definition)} validProgram
 * @returns {boolean}
 */
export const isValidProgram = (validProgram) =>
  isExpression(validProgram) || isDefinition(validProgram);
