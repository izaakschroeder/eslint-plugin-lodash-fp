'use strict';
var _ = require('lodash/fp');

/**
 * Gets the object that called the method in a CallExpression
 * @param {Object} node
 * @returns {Object|undefined}
 */
var getCaller = _.property(['callee', 'object']);

/**
 * Gets the name of a method in a CallExpression
 * @param {Object} node
 * @returns {string|undefined}
 */
var getMethodName = _.property(['callee', 'property', 'name']);

/**
 * Returns whether the node is a method call
 * @param {Object} node
 * @returns {boolean}
 */
var isMethodCall = _.matches({type: 'CallExpression', callee: {type: 'MemberExpression'}});

/**
 * Returns whether the node is a function declaration that has a block
 * @param {Object} node
 * @returns {boolean}
 */
var isFunctionDefinitionWithBlock = _.overSome([
  _.matchesProperty('type', 'FunctionExpression'),
  _.matchesProperty('type', 'FunctionDeclaration'),
  _.matches({type: 'ArrowFunctionExpression', body: {type: 'BlockStatement'}})
]);

/**
 * If the node specified is a function, returns the node corresponding with the first statement/expression in that function
 * @param {Object} node
 * @returns {node|undefined}
 */
var getFirstFunctionLine = _.cond([
    [isFunctionDefinitionWithBlock, _.property(['body', 'body', 0])],
    [_.matches({type: 'ArrowFunctionExpression'}), _.property('body')]
]);

/**
 *
 * @param {Object} node
 * @returns {boolean|undefined}
 */
var isPropAccess = _.overSome([
  _.matches({computed: false}),
  _.matchesProperty(['property', 'type'], 'Literal')
]);

/**
 * Returns whether the node is a member expression starting with the same object, up to the specified length
 * @param {Object} node
 * @param {string} objectName
 * @param {number} maxPropertyPathLength
 * @param {boolean} allowComputed
 * @returns {boolean|undefined}
 */
function isMemberExpOf(node, objectName, maxPropertyPathLength, allowComputed) {
  if (objectName) {
    var curr = node;
    var depth = maxPropertyPathLength;
    while (curr && depth) {
      if (curr.type === 'MemberExpression' && curr.object.name === objectName) {
        return allowComputed || isPropAccess(node);
      }
      curr = curr.object;
      depth--;
    }
  }
}

/**
 * Returns the name of the first parameter of a function, if it exists
 * @param {Object} func
 * @returns {string|undefined}
 */
var getFirstParamName = _.property(['params', 0, 'name']);

/**
 * Returns whether or not the expression is a return statement
 * @param {Object} exp
 * @returns {boolean|undefined}
 */
var isReturnStatement = _.matchesProperty('type', 'ReturnStatement');

/**
 * Returns whether the node specified has only one statement
 * @param {Object} func
 * @returns {boolean}
 */
function hasOnlyOneStatement(func) {
  return func.type === 'ArrowFunctionExpression' ? !_.get('body.body', func) : _.get('body.body.length', func) === 1;
}

/**
 * Returns whether the node is an object of a method call
 * @param {Object} node
 * @returns {boolean}
 */
function isObjectOfMethodCall(node) {
  return _.get('parent.object', node) === node && _.get('parent.parent.type', node) === 'CallExpression';
}

/**
 * Returns whether the node is a literal
 * @param {Object} node
 * @returns {boolean}
 */
var isLiteral = _.matchesProperty('type', 'ReturnStatement');

/**
 * Returns whether the expression specified is a binary expression with the specified operator and one of its sides is a member expression of the specified object name
 * @param {string} operator
 * @param {Object} exp
 * @param {string} objectName
 * @param {number} maxPropertyPathLength
 * @param {boolean} allowComputed
 * @param {boolean} onlyLiterals
 * @returns {boolean|undefined}
 */
function isBinaryExpWithMemberOf(operator, exp, objectName, maxPropertyPathLength, allowComputed, onlyLiterals) {
  return exp && exp.type === 'BinaryExpression' && exp.operator === operator &&
          (isMemberExpOf(exp.left, objectName, maxPropertyPathLength, allowComputed) ||
          isMemberExpOf(exp.right, objectName, maxPropertyPathLength, allowComputed)) &&
          (!onlyLiterals || (isLiteral(exp.left) || isLiteral(exp.right)));
}

/**
 * Returns whether the specified expression is a negation.
 * @param {Object} exp
 * @returns {boolean|undefined}
 */
var isNegationExpression = _.matches({type: 'UnaryExpression', operator: '!'});

/**
 * Returns whether the expression is a negation of a member of objectName, in the specified depth.
 * @param {Object} exp
 * @param {string} objectName
 * @param {number} maxPropertyPathLength
 * @returns {boolean|undefined}
 */
function isNegationOfMemberOf(exp, objectName, maxPropertyPathLength) {
  return isNegationExpression(exp) && isMemberExpOf(exp.argument, objectName, maxPropertyPathLength, false);
}

/**
 *
 * @param {Object} exp
 * @param {string} paramName
 * @returns {boolean|undefined}
 */
function isIdentifierOfParam(exp, paramName) {
  return exp && paramName && exp.type === 'Identifier' && exp.name === paramName;
}

/**
 * Returns the node of the value returned in the first line, if any
 * @param {Object} func
 * @returns {Object|null}
 */
function getValueReturnedInFirstLine(func) {
  var firstLine = getFirstFunctionLine(func);
  if (func) {
    if (isFunctionDefinitionWithBlock(func)) {
      return isReturnStatement(firstLine) ? firstLine.argument : null;
    }
    if (func.type === 'ArrowFunctionExpression') {
      return firstLine;
    }
  }
  return null;
}

/**
 * Returns whether the node is a call from the specified object name
 * @param {Object} node
 * @param {string} objName
 * @returns {boolean|undefined}
 */
function isCallFromObject(node, objName) {
  return node && node.type === 'CallExpression' && _.get('callee.object.name', node) === objName;
}

/**
 * Returns whether the node is actually computed (x['ab'] does not count, x['a' + 'b'] does
 * @param {Object} node
 * @returns {boolean|undefined}
 */
function isComputed(node) {
  return _.get('computed', node) && node.property.type !== 'Literal';
}

/**
 * Returns whether the two expressions refer to the same object (e.g. a['b'].c and a.b.c)
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function isEquivalentExp(a, b) {
  return _.isEqualWith(function (left, right, key) {
    if (_.includes(key, ['loc', 'range', 'computed', 'start', 'end'])) {
      return true;
    }
    if (isComputed(left) || isComputed(right)) {
      return false;
    }
    if (key === 'property') {
      var leftValue = left.name || left.value;
      var rightValue = right.name || right.value;
      return leftValue === rightValue;
    }
  }, a, b);
}

/**
 * Returns whether the expression is a strict equality comparison, ===
 * @param {Object} node
 * @returns {boolean}
 */
var isEqEqEq = _.matches({type: 'BinaryExpression', operator: '==='});

function isMinus(node) {
  return node.type === 'UnaryExpression' && node.operator === '-';
}

/**
 * Enum for type of comparison to int literal
 * @readonly
 * @enum {number}
 */
var comparisonType = {
  exact: 0,
  over: 1,
  under: 2,
  any: 3
};
var comparisonOperators = ['==', '!=', '===', '!=='];

function getIsValue(value) {
  return value < 0 ? _.overEvery(isMinus, _.matches({argument: {value: -value}})) : _.matches({value: value});
}

/**
 * Returns the expression compared to the value in a binary expression, or undefined if there isn't one
 * @param {Object} node
 * @param {number} value
 * @param {boolean} [checkOver=false]
 * @returns {Object|undefined}
 */
function getExpressionComparedToInt(node, value, checkOver) {
  var isValue = getIsValue(value);
  if (_.includes(comparisonOperators, node.operator)) {
    if (isValue(node.right)) {
      return node.left;
    }
    if (isValue(node.left)) {
      return node.right;
    }
  }
  if (checkOver) {
    if (node.operator === '>' && isValue(node.right)) {
      return node.left;
    }
    if (node.operator === '<' && isValue(node.left)) {
      return node.right;
    }
    var isNext = getIsValue(value + 1);
    if ((node.operator === '>=' || node.operator === '<') && isNext(node.right)) {
      return node.left;
    }
    if ((node.operator === '<=' || node.operator === '>') && isNext(node.left)) {
      return node.right;
    }
  }
}

/**
 * Returns whether the node is a call to indexOf
 * @param {Object} node
 * @returns {boolean}
 */
function isIndexOfCall(node) {
  return isMethodCall(node) && getMethodName(node) === 'indexOf';
}

var isFunction = _.includes(_, ['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression']);

function isIdentityFunction(node) {
  if (!isFunction(node.type) || node.params.length !== 1 || !node.body) {
    return false;
  }
  var returnedElement;
  if (node.body.type === 'BlockStatement') {
    var subBody = node.body.body;
    if (subBody.length !== 1 || subBody[0].type !== 'ReturnStatement') {
      return false;
    }
    returnedElement = subBody[0].argument;
  } else {
    returnedElement = node.body;
  }

  return returnedElement.type === 'Identifier' &&
    returnedElement.name === node.params[0].name;
}

module.exports = {
  getCaller: getCaller,
  getMethodName: getMethodName,
  isMethodCall: isMethodCall,
  getFirstFunctionLine: getFirstFunctionLine,
  isMemberExpOf: isMemberExpOf,
  getFirstParamName: getFirstParamName,
  hasOnlyOneStatement: hasOnlyOneStatement,
  isObjectOfMethodCall: isObjectOfMethodCall,
  isEqEqEqToMemberOf: isBinaryExpWithMemberOf.bind(null, '==='),
  isNotEqEqToMemberOf: isBinaryExpWithMemberOf.bind(null, '!=='),
  isNegationOfMemberOf: isNegationOfMemberOf,
  isIdentifierOfParam: isIdentifierOfParam,
  isNegationExpression: isNegationExpression,
  getValueReturnedInFirstLine: getValueReturnedInFirstLine,
  isCallFromObject: isCallFromObject,
  isComputed: isComputed,
  isEquivalentExp: isEquivalentExp,
  isEqEqEq: isEqEqEq,
  comparisonType: comparisonType,
  getExpressionComparedToInt: getExpressionComparedToInt,
  isIndexOfCall: isIndexOfCall,
  isIdentityFunction: isIdentityFunction
};
