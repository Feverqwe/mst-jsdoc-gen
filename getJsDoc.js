const parser = require('@babel/parser');
const fs = require('fs');
const path = require('path');

const RESULT = {
  name: null,
  properties: {},
  actions: {},
  views: {}
};

const variables = {
  ObjectExpression: node => {
    return node.properties.map(child => parseVars(child, node));
  },
  ObjectProperty: node => {
    const key = parseVars(node.key);
    const value = parseVars(node.value);
    return [key, value];
  },
  CallExpression: node => {
    return {
      type: 'function',
      callee: parseVars(node.callee),
      args: node.arguments.map(child => parseVars(child, node))
    };
  },
  MemberExpression: node => {
    const obj = parseVars(node.object, node);
    const props = parseVars(node.property, node);
    return [obj, props].join('.');
  },
  Identifier: node => {
    return node.name;
  },
  ArrayExpression: node => {
    return '[]';
  },
  BooleanLiteral: node => {
    return 'types.boolean';
  },
  StringLiteral: node => {
    return 'types.string';
  },
};

const actions = {
  ObjectExpression: node => {
    return node.properties.map(child => parseActions(child, node));
  },
  ArrowFunctionExpression: node => {
    return parseActions(node.body, node);
  },
  ObjectMethod: node => {
    return [node.kind, parseActions(node.key, node)];
  },
  BlockStatement: node => {
    return node.body.filter(child => child.type === 'ReturnStatement').map(child => parseActions(child, node))[0];
  },
  ReturnStatement: node => {
    return parseActions(node.argument, node);
  },
  ObjectProperty: node => {
    const key = parseActions(node.key, node);
    const value = parseActions(node.value, node);
    return ['method', key];
  },
  CallExpression: node => {
    return parseActions(node.callee, node);
  },
  Identifier: node => {
    return node.name;
  },
};

const model = {
  ExpressionStatement: node => {
    return parseModel(node.expression, node);
  },
  CallExpression: node => {
    return parseModel(node.callee, node);
  },
  MemberExpression: node => {
    const obj = parseModel(node.object, node);
    const props = parseModel(node.property, node);
    const result = [obj, props].join('.');
    if (result === 'types.model') {
      let name = null;
      const fistArg = node._parent().arguments[0];
      if (fistArg.type === 'StringLiteral') {
        name = fistArg.value;
        node._parent().arguments.shift();
      }
      const vars = parseVars(node._parent().arguments[0]);
      RESULT.name = name;
      vars.forEach(([key, value]) => {
        RESULT.properties[key] = value;
      });
      console.log('Variables', JSON.stringify(vars));
    } else
    if (result === '.views') {
      const actions = parseActions(node._parent().arguments[0]);
      actions.forEach(([kind, name]) => {
        RESULT.views[name] = kind;
      });
      console.log('Views', JSON.stringify(actions));
    } else
    if (result === '.actions') {
      const actions = parseActions(node._parent().arguments[0]);
      actions.forEach(([kind, name]) => {
        RESULT.actions[name] = kind;
      });
      console.log('Actions', JSON.stringify(actions));
    }
  },
  Identifier: node => {
    return node.name;
  }
};

const parseVars = (node, parentNode) => {
  node._parent = () => parentNode;
  if (!variables[node.type]) {
    console.log(node.type);
  }
  return variables[node.type](node);
};

const parseActions = (node, parentNode) => {
  node._parent = () => parentNode;
  if (!actions[node.type]) {
    console.log(node.type);
  }
  return actions[node.type](node);
};

const parseModel = (node, parentNode) => {
  node._parent = () => parentNode;
  return model[node.type](node);
};

const getType = kind => {
  let type = '';
  switch (kind) {
    case 'method': {
      type = 'function';
      break;
    }
    case 'get': {
      type = '*';
      break;
    }
  }
  if (type) {
    type = `{${type}} `;
  }
  return type;
};

const getPropType = value => {
  let type = '*';
  let isOptional = false;
  if (value.type === 'function') {
    let {callee, args} = value;
    switch (callee) {
      case 'types.identifier': {
        if (!args.length) {
          args.push('types.string');
        }
        type = getPropType(args[0]).type;
        break;
      }
      case 'types.array': {
        type = `${getPropType(args[0]).type}[]`;
        break;
      }
      case 'types.map': {
        type = `Map<*,${getPropType(args[0]).type}>`;
        break;
      }
      case 'types.reference': {
        type = getPropType(args[0]).type;
        break;
      }
      case 'types.enumeration': {
        type = getPropType('types.string').type;
        break;
      }
      case 'types.optional': {
        isOptional = true;
        type = getPropType(args[0]).type;
        break;
      }
      case 'types.maybe': {
        isOptional = true;
        type = getPropType(args[0]).type;
        break;
      }
    }
  } else {
    switch (value) {
      case 'types.string': {
        type = 'string';
        break;
      }
      case 'types.number': {
        type = 'number';
        break;
      }
      case 'types.integer': {
        type = 'integer';
        break;
      }
      case 'types.boolean': {
        type = 'boolean';
        break;
      }
      case 'types.Date': {
        type = 'Date';
        break;
      }
      case 'types.identifier': {
        type = 'string';
        break;
      }
      case 'types.null': {
        type = 'null';
        break;
      }
      case 'types.undefined': {
        type = 'undefined';
        break;
      }
      default: {
        type = value;
      }
    }
  }
  return {type, isOptional};
};

(() => {
  const code = fs.readFileSync(path.resolve('./model.js')).toString().trim();
  const ast = parser.parse(code);

  console.log(JSON.stringify(ast.program));

  ast.program.body.forEach(node => {
    parseModel(node);
  });

  let result = [];
  if (RESULT.name) {
    result.push(`@typedef {{}} ${RESULT.name}`);
  }
  Object.keys(RESULT.properties).forEach(key => {
    const value = RESULT.properties[key];
    let {type, isOptional} = getPropType(value);

    if (type) {
      type = `{${type}} `;
    }
    if (isOptional) {
      key = `[${key}]`;
    }
    result.push(`@property ${type}${key}`);
  });
  Object.keys(RESULT.views).forEach(key => {
    let type = getType(RESULT.views[key]);
    result.push(`@property ${type}${key}`);
  });
  Object.keys(RESULT.actions).forEach(key => {
    let type = getType(RESULT.actions[key]);
    result.push(`@property ${type}${key}`);
  });

  console.log(`\n\n/**\n${result.map(line => `* ${line}`).join('\n')}\n*/`);
})();