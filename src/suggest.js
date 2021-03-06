import parseType from "./parseType";
import typeKinds from "./typeKinds";
import isTypeAssignable from "./isTypeAssignable";
import { caml_equal } from "bs-platform/lib/js/caml_obj";
import $$Array from "bs-platform/lib/js/array.js";
import reasonExpToJs from "./reasonExpToJs";

const db = require("./generated/db.js");

var compilationCache = new Map();

function memoizedReasonExpToJs(exp) {
  if (compilationCache.has(exp)) {
    return compilationCache.get(exp);
  }

  let result = reasonExpToJs(exp);
  compilationCache.set(exp, result);
  return result;
}

function flatten(arrayOfArrays) {
  var result = [];
  for (var array of arrayOfArrays) {
    for (var item of array) {
      result.push(item);
    }
  }
  return result;
}

function permutator(inputArr) {
  let result = [];
  const permute = (arr, m = []) => {
    if (arr.length === 0) {
      result.push(m);
    } else {
      for (let i = 0; i < arr.length; i++) {
        let curr = arr.slice();
        let next = curr.splice(i, 1);
        permute(curr.slice(), m.concat(next));
      }
    }
  };
  permute(inputArr);
  return result;
}

const astTypeToFunctionPairs = Object.values(db).map(([type, funcs]) => [
  parseType(type),
  $$Array.of_list(funcs)
]);

export function makeAstFunctionType(inputs, output) {
  if (inputs.length === 0) {
    return parseType(output.type);
  }
  return {
    kind: typeKinds.func,
    input: parseType(inputs[0].type),
    output: makeAstFunctionType(inputs.slice(1), output)
  };
}

export function orderedSuggest(inputs, output) {
  const expectedFunctionType = makeAstFunctionType(inputs, output);
  const reasonInputs = inputs.map(i => i.jsValue);
  const functionsWithMatchingSignature = flatten(
    astTypeToFunctionPairs
      .filter(([ast, funcs]) => {
        return isTypeAssignable(ast, expectedFunctionType);
      })
      .map(([ast, funcs]) => funcs)
  );

  return functionsWithMatchingSignature
    .filter(([func, _name]) => {
      try {
        return (
          caml_equal(func.apply(null, reasonInputs), output.jsValue) === true
        );
      } catch (ex) {
        return false;
      }
    })
    .map(([_func, name]) => name)
    .map(functionName => ({
      functionName,
      inputs,
      output
    }));
}

export default function suggest(inputs, output) {
  const compiledInputs = inputs.map(memoizedReasonExpToJs);
  const compiledOutput = memoizedReasonExpToJs(output);

  if (
    compiledInputs.some(i => i.error !== null) ||
    compiledOutput.error !== null
  ) {
    return {
      inputs: compiledInputs,
      output: compiledOutput,
      suggestions: []
    };
  }

  var validInputs = compiledInputs.filter(i => i.code.length > 0);

  if (validInputs.length === 0 || compiledOutput.code.length === 0) {
    return {
      inputs: compiledInputs,
      output: compiledOutput,
      suggestions: []
    };
  }

  return {
    inputs: compiledInputs,
    output: compiledOutput,
    suggestions: flatten(
      permutator(validInputs).map(permutedInputs =>
        orderedSuggest(permutedInputs, compiledOutput)
      )
    )
  };
}
