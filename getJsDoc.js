const traverse = require('@babel/traverse').default;
const parser = require('@babel/parser');
const types = require('@babel/types');
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.resolve('./model.js')).toString().trim();
const ast = parser.parse(code);

let id = 0;

console.log('ast', JSON.stringify(clean(ast)));

const pathModelMap = new Map();
const idModelMap = new Map();

class Model {
  constructor() {
    this.id = ++id;
  }
}

const ModelVisitor = {
  CallExpression(path, state) {
    const args = path.node.arguments;
    const callee = path.node.callee;
    const property = callee.property;
    if (callee.type === 'MemberExpression' && property.type === 'Identifier') {
      switch (property.name) {
        case 'model': {
          let modelProps = path.get('arguments.0');
          if (modelProps.node.type === 'StringLiteral') {
            state.name = args[0].value;
            modelProps = path.get('arguments.1');
          }
          const properties = state.properties = {};
          if (modelProps.node.type === 'ObjectExpression') {
            modelProps.node.properties.forEach((propNode, index) => {
              const propPath = modelProps.get(`properties.${index}`);
              if (propPath.node.type === 'ObjectProperty') {
                const keyNode = propPath.node.key;
                const valueNode = propPath.node.value;
                if (keyNode.type === 'Identifier') {
                  properties[keyNode.name] = getModelPropertyValue(valueNode);
                } else {
                  console.error('Unknown model property key', keyNode);
                }
              } else {
                console.error('Unknown model property type', propPath.node);
              }
            });
          } else {
            console.error('Unknown model argument', modelProps.node);
          }
          break;
        }
        case 'actions':
        case 'views': {
          const methods = state[property.name] = {};
          const fn = path.get('arguments.0.body');
          let returnNodeIndex = null;
          fn.node.body.some((node, index) => {
            if (node.type === 'ReturnStatement') {
              returnNodeIndex = index;
              return true;
            }
          });
          const result = fn.get(`body.${returnNodeIndex}.argument`);
          if (result) {
            getActions(result, methods);
          }
          break;
        }
      }
    }
  }
};

const getActions = (result, state) => {
  if (result.node.type === 'ObjectExpression') {
    result.node.properties.forEach((propNode, index) => {
      const propPath = result.get(`properties.${index}`);
      if (propPath.node.type === 'ObjectProperty') {
        const keyNode = propPath.node.key;
        const valueNode = propPath.node.value;
        if (keyNode.type === 'Identifier') {
          state[keyNode.name] = getModelMethods(valueNode);
        } else {
          console.error('Unknown action property key', keyNode);
        }
      } else
      if (propPath.node.type === 'ObjectMethod') {
        const keyNode = propPath.node.key;
        const bodyNode = propPath.node.body;
        if (keyNode.type === 'Identifier') {
          if (propPath.node.kind === 'method') {
            state[keyNode.name] = 'function'
          } else {
            state[keyNode.name] = '*';
          }
        } else {
          console.error('Unknown action property key', keyNode);
        }
      } else {
        console.error('Unknown action property type', propPath.node);
      }
    });
  } else {
    console.error('Unknown action argument', result.node);
  }
};

traverse(ast, {
  MemberExpression(path) {
    if (path.node.object.name === 'types' && path.node.property.name === 'model') {
      const modelStartPath = getModelStart(path);
      if (modelStartPath) {
        if (!pathModelMap.has(modelStartPath)) {
          let modelPath = null;
          let replaceTo = identifier => identifier;
          if (['VariableDeclarator', 'ExpressionStatement', 'CallExpression'].includes(modelStartPath.node.type)) {
            modelPath = modelStartPath;
          } else
          if (modelStartPath.node.type === 'ObjectProperty') {
            modelPath = modelStartPath;
            replaceTo = identifier => {
              return types.objectProperty(modelPath.node.key, identifier);
            };
          }
          if (modelPath) {
            let model = new Model();
            const id = `Model#${model.id}`;
            const clone = modelPath.node;
            modelPath.replaceWith(replaceTo(types.identifier(id)));
            modelPath.node = clone;
            pathModelMap.set(modelPath, model);
            idModelMap.set(id, model);
          } else {
            console.error('Model path not found', modelStartPath.node);
          }
        }
      }
    }
  }
});

Array.from(pathModelMap.keys()).forEach(path => {
  const model = pathModelMap.get(path);
  path.traverse(ModelVisitor, model);
});

Array.from(pathModelMap.values()).forEach(model => {
  if (model.name || !model.ref) {
    console.log(getModelJsDoc(model));
  }
});

function getModelJsDoc(model) {
  const result = [];

  result.push(['@typedef', '{{}}', model.name || `Model#${model.id}`]);

  const getFloatModelProps = model => {
    if (model.name) {
      return {type: model.name};
    }
    const result = [];
    model.properties && Object.keys(model.properties).forEach(key => {
      let value = model.properties[key];
      const type = getPropType(value);
      result.push([key, type.type]);
    });
    model.actions && Object.keys(model.actions).forEach(key => {
      const value = model.actions[key];
      const type = getActionType(value);
      result.push([key, type.type]);
    });
    model.views && Object.keys(model.views).forEach(key => {
      const value = model.views[key];
      const type = getActionType(value);
      result.push([key, type.type]);
    });
    return {type: `{${result.map(item => item.join(':')).join(',')}}`}
  };
  const getActionType = value => {
    if (!value) {
      console.error('Unknown action', key, value);
    }
    return {type: value};
  };
  const getPropType = value => {
    if (typeof value === 'string') {
      value = {type: value};
    }
    if (value instanceof Model) {
      value = getFloatModelProps(value);
    }
    if (!value.type) {
      console.error('Unknown type', value);
    }
    return value;
  };
  model.properties && Object.keys(model.properties).forEach(key => {
    let value = model.properties[key];
    const type = getPropType(value);
    let name = key;
    if (type.optional) {
      name = `[${name}]`;
    }
    result.push(['@property', `{${type.type}}`, name]);
  });

  model.actions && Object.keys(model.actions).forEach(key => {
    const value = model.actions[key];
    const type = getActionType(value);
    result.push(['@property', `{${type.type}}`, key]);
  });
  model.views && Object.keys(model.views).forEach(key => {
    const value = model.views[key];
    const type = getActionType(value);
    result.push(['@property', `{${type.type}}`, key]);
  });

  return `\n\n/**\n${result.map(line => `* ${line.join(' ')}`).join('\n')}\n*/`;
}

function getModelMethods(node) {
  const walk = node => {
    switch (node.type) {
      case 'BlockStatement': {
        return '*';
      }
      case 'ArrowFunctionExpression': {
        return 'function';
      }
      case 'CallExpression': {
        if (node.callee.type === 'Identifier' && node.callee.name === 'flow') {
          return 'Promise'
        } else {
          return 'function';
        }
      }
      default: {
        console.error(`Method type is not found ${node.type}`, node);
      }
    }
  };
  return walk(node);
}

function getModelPropertyValue(node) {
  const walk = node => {
    switch (node.type) {
      case 'MemberExpression': {
        let result = {
          type: 'MemberExpression',
          object: walk(node.object),
          property: walk(node.property)
        };
        if (result.object === 'types') {
          switch (result.property) {
            case 'identifier': {
              return 'string';
            }
            case 'identifierNumber': {
              return 'number';
            }
            default: {
              return result.property;
            }
          }
        }
        return result;
      }
      case 'Identifier': {
        const model = idModelMap.get(node.name);
        if (model) {
          model.ref = true;
          return model;
        } else {
          return node.name;
        }
      }
      case 'CallExpression': {
        const result = {
          type: 'CallExpression',
          callee: walk(node.callee),
          arguments: node.arguments.map(walk),
        };
        switch (result.callee) {
          case 'array': {
            const type = result.arguments[0];
            if (typeof type === 'string') {
              return `${type}[]`;
            }
            break;
          }
          case 'map': {
            const type = result.arguments[0];
            if (typeof type === 'string') {
              return `Map<*,${type}>`;
            }
            break;
          }
          case 'optional':
            return result.arguments[0];
          case 'maybeNull':
          case 'maybe': {
            const type = result.arguments[0];
            if (typeof type === 'string') {
              return {
                type: type,
                optional: true
              };
            } else {
              type.optional = true;
              return type;
            }
          }
          case 'enumeration':
          case 'literal': {
            return 'string';
          }
          case 'reference':
            const type = result.arguments[0];
            if (typeof type === 'string') {
              return type;
            }
            break;
          case 'frozen':
            return {
              type: '*',
              optional: true
            };
          case 'compose':
          case 'late':
          case 'refinement':
          case 'union': {
            return '*';
          }
        }
        return result;
      }
      case 'ObjectExpression': {
        return {
          type: 'ObjectExpression',
          properties: node.properties.map(walk),
        }
      }
      case 'ObjectProperty': {
        return {
          type: 'ObjectProperty',
          key: walk(node.key),
          value: walk(node.value)
        };
      }
      case 'ArrowFunctionExpression': {
        return {
          type: 'function'
        };
      }
      case 'StringLiteral': {
        return {
          type: 'string'
        };
      }
      case 'ArrayExpression': {
        return '[]';
      }
      case 'BooleanLiteral': {
        return 'boolean';
      }
      case 'NumericLiteral': {
        return 'number';
      }
      default: {
        console.error(`Type is not found ${node.type}`, node);
      }
    }
  };
  return walk(node);
}

function getModelStart(path) {
  const goBack = path => {
    let parent = path.parentPath;
    if (parent.node.type === 'CallExpression') {
      parent = parent.parentPath;
      if (parent.node.type === 'MemberExpression') {
        return goBack(parent);
      } else {
        return parent;
      }
    } else {
      return parent;
    }
  };
  return goBack(path);
}

function clean(ast) {
  ast = JSON.parse(JSON.stringify(ast));

  const walk = obj => {
    if (Array.isArray(obj)) {
      obj.forEach(item => walk(item));
    } else
    if (obj && typeof obj === 'object') {
      if (typeof obj.loc === 'object') {
        delete obj.loc;
      }
      if (typeof obj.start === 'number') {
        delete obj.start;
      }
      if (typeof obj.end === 'number') {
        delete obj.end;
      }
      Object.keys(obj).forEach(key => {
        const item = obj[key];
        if (typeof item === 'object') {
          walk(obj[key]);
        }
      });
    }
  };
  walk(ast);

  return ast;
}