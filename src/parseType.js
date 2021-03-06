import typeKinds from "./typeKinds";

const simpleTypes = ["bool", "int", "float", "string", "char"];

export const tokenKinds = {
  simple: "simple",
  list: "list",
  array: "array",
  arrow: "arrow",
  generic: "generic",
  star: "star",
  openParenthesis: "openParenthesis",
  closeParenthesis: "closeParenthesis"
};

export function tokenStream(str) {
  const words = [];
  let lastEnd = 0;

  for (var i = 0; i < str.length; i++) {
    switch (str[i]) {
      case " ":
        words.push(str.substring(lastEnd, i));
        lastEnd = i + 1;
        break;
      case "(":
        words.push("(");
        lastEnd = i + 1;
        break;
      case ")":
        words.push(str.substring(lastEnd, i));
        words.push(str[i]);
        i++;
        lastEnd = i + 1;
        break;
      default:
        break;
    }
  }
  words.push(str.substring(lastEnd, str.length));

  let current = null;
  let pos = 0;

  function isSimpleType(word) {
    return simpleTypes.includes(word);
  }

  function readNext() {
    if (pos === words.length) {
      return null;
    }
    const word = words[pos++];
    if (isSimpleType(word)) {
      return { kind: tokenKinds.simple, value: word };
    } else if (word === "list") {
      return { kind: tokenKinds.list };
    } else if (word === "array") {
      return { kind: tokenKinds.array };
    } else if (word === "->") {
      return { kind: tokenKinds.arrow };
    } else if (word[0] === "'") {
      return { kind: tokenKinds.generic, value: word };
    } else if (word === "(") {
      return { kind: tokenKinds.openParenthesis };
    } else if (word === ")") {
      return { kind: tokenKinds.closeParenthesis };
    } else if (word === "*") {
      return { kind: tokenKinds.star };
    }

    throw new Error("Unkown word: '" + word + "' words: " + words);
  }

  function peek() {
    return current || (current = readNext());
  }

  return {
    peek: peek,
    next: () => {
      var tok = current;
      current = null;
      return tok || readNext();
    }
  };
}

function getLastOrDefault(arr) {
  if (arr.length === 0) {
    return null;
  }
  return arr[arr.length - 1];
}

const priorityMap = {
  [tokenKinds.openParenthesis]: 0,
  [tokenKinds.arrow]: 1,
  [tokenKinds.star]: 2,
  [tokenKinds.list]: 3,
  [tokenKinds.array]: 3
};

function hasLowerPrecedenceThanTopOperator(operatorsStack, token) {
  let topOperator = getLastOrDefault(operatorsStack);
  if (topOperator === null) {
    return false;
  }

  return priorityMap[topOperator.kind] > priorityMap[token.kind];
}

export function createPostfixExpression(tokenStream) {
  let operatorStack = [];
  let postfix = [];

  let token = null;

  while ((token = tokenStream.next()) != null) {
    switch (token.kind) {
      case tokenKinds.simple:
      case tokenKinds.generic:
        postfix.push(token);
        break;
      case tokenKinds.star:
      case tokenKinds.arrow:
      case tokenKinds.list:
      case tokenKinds.array:
        if (hasLowerPrecedenceThanTopOperator(operatorStack, token)) {
          postfix.push(operatorStack.pop());
        }
        operatorStack.push(token);
        break;
      case tokenKinds.openParenthesis:
        operatorStack.push(token);
        break;
      case tokenKinds.closeParenthesis:
        let operator = null;
        while (
          (operator = operatorStack.pop()).kind !== tokenKinds.openParenthesis
        ) {
          postfix.push(operator);
        }
        break;
      default:
        throw new Error("Unknown token: " + JSON.stringify(token));
    }

    // console.log(
    //   "Token: ",
    //   token,
    //   "\nOps: ",
    //   operatorStack,
    //   "\nPostfix: ",
    //   postfix
    // );
  }

  while ((token = operatorStack.pop()) != null) {
    postfix.push(token);
  }

  return postfix;
}

function makeType(tokenStream) {
  let postfix = createPostfixExpression(tokenStream);

  let types = [];

  for (let token of postfix) {
    switch (token.kind) {
      case tokenKinds.simple:
        types.push({ kind: typeKinds.simple, type: token.value });
        break;
      case tokenKinds.generic:
        types.push({ kind: typeKinds.generic, type: token.value });
        break;
      case tokenKinds.star:
        types.push({
          kind: typeKinds.tuple,
          secondType: types.pop(),
          firstType: types.pop()
        });
        break;
      case tokenKinds.arrow:
        types.push({
          kind: typeKinds.func,
          output: types.pop(),
          input: types.pop()
        });
        break;
      case tokenKinds.list:
        types.push({
          kind: typeKinds.list,
          itemType: types.pop()
        });
        break;
      case tokenKinds.array:
        types.push({
          kind: typeKinds.array,
          itemType: types.pop()
        });
        break;
      default:
        throw new Error("Unknown token: " + JSON.stringify(token));
    }
  }

  return types[0];
}

// Parse type extracted from compilation error
// The Shunting Yard Algorithm: http://www.oxfordmathcenter.com/drupal7/node/628
// 3.9.3. Postfix Evaluation: http://interactivepython.org/runestone/static/pythonds/BasicDS/InfixPrefixandPostfixExpressions.html
export default function parseType(str) {
  return makeType(tokenStream(str));
}
