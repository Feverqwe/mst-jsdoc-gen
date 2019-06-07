const traverse = require('@babel/traverse').default;
const parser = require('@babel/parser');
const types = require('@babel/types');
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.resolve('./model.js')).toString().trim();
const ast = parser.parse(code, {
  allowImportExportEverywhere: true
});

let id = 0;

// console.log('ast', JSON.stringify(clean(ast)));

const pathModelMap = new Map();
const identifierModelMap = new Map();

class Model {
  constructor() {
    this.id = ++id;
    this.name = null;
    this.identifier = `Model#${this.id}`;
    this.inheret = [];
    this.properties = {};
    this.actions = {};
    this.views = {};
  }
}

class ModelType {
  constructor(type) {
    this.type = type;
    this.model = null;
    this.optional = null;
    this.childs = [];
  }
  insert(type) {
    this.childs.push(type);
  }
  getProp() {
    switch (this.type) {
      case 'map': {
        const result = this.childs[0].getProp();
        result.type = `Map<*,${result.type}>`;
        return result;
      }
      case 'array': {
        const result = this.childs[0].getProp();
        result.type = `${result.type}[]`;
        return result;
      }
      case 'maybeNull': {
        const result = this.childs[0].getProp();
        result.type = `${result.type}|undefined|null`;
        return result;
      }
      case 'maybe': {
        const result = this.childs[0].getProp();
        result.type = `${result.type}|undefined`;
        return result;
      }
      case 'optional': {
        const result = this.childs[0].getProp();
        result.optional = true;
        return result;
      }
      case 'model': {
        return getFloatModelProps(this.model);
      }
      case 'late':
      case 'refinement':
      case 'union':
      case 'frozen':
      case 'custom':
      case 'reference':
      case 'safeReference':
      case 'enumeration':
      case 'literal': {
        return this.childs[0].getProp();
      }
      case 'Date': {
        return {type: 'Date'};
      }
      case 'null': {
        return {type: 'null'};
      }
      case 'undefined': {
        return {type: 'undefined'};
      }
      default: {
        switch (this.type) {
          case 'identifier': {
            return {type: 'string'}
          }
          case 'integer':
          case 'identifierNumber': {
            return {type: 'number'}
          }
        }
        return {type: this.type};
      }
    }
  }
}

const ModelVisitor = {
  MemberExpression(mePath, state) {
    const callExpression = mePath.parentPath;
    if (callExpression.node.type === 'CallExpression' && callExpression.node.callee === mePath.node) {
      const property = mePath.node.property;
      if (property.type === 'Identifier') {
        switch (property.name) {
          case 'model': {
            let modelProps = callExpression.get('arguments.0');
            if (modelProps.node.type === 'StringLiteral') {
              state.name = modelProps.node.value;
              modelProps = callExpression.get('arguments.1');
            }
            const properties = state.properties = {};
            parseModel(modelProps, properties);
            break;
          }
          case 'actions':
          case 'views': {
            const methods = state[property.name] = {};
            const fn = callExpression.get('arguments.0.body');
            if (fn.node.type === 'ObjectExpression') {
              parseActions(fn, methods);
            } else {
              let returnNodeIndex = null;
              fn.node.body.some((node, index) => {
                if (node.type === 'ReturnStatement') {
                  returnNodeIndex = index;
                  return true;
                }
              });
              const result = fn.get(`body.${returnNodeIndex}.argument`);
              if (result) {
                parseActions(result, methods);
              }
            }
            break;
          }
          case 'compose': {
            let firstModelIndex = 0;
            let modelProps = callExpression.get('arguments.0');
            if (modelProps.node.type === 'StringLiteral') {
              state.name = modelProps.node.value;
              firstModelIndex++;
            }
            callExpression.node.arguments.forEach((node, index) => {
              if (index >= firstModelIndex) {
                const arg = callExpression.get(`arguments.${index}`);
                if (arg.node.type === 'Identifier') {
                  const model = identifierModelMap.get(arg.node.name);
                  if (model) {
                    model.ref = true;
                    state.inheret.push(model);
                  } else {
                    state.inheret.push(arg.node.name);
                  }
                }
              }
            });
            break;
          }
          case 'named': {
            let namePath = callExpression.get('arguments.0');
            if (namePath.node.type === 'StringLiteral') {
              state.name = namePath.node.value;
            }
            break;
          }
        }
      }
    }
  }
};

const parseModel = (modelProps, properties) => {
  if (modelProps.node.type === 'ObjectExpression') {
    modelProps.node.properties.forEach((propNode, index) => {
      const propPath = modelProps.get(`properties.${index}`);
      if (propPath.node.type === 'ObjectProperty') {
        const keyNode = propPath.node.key;
        const valueNode = propPath.node.value;
        if (keyNode.type === 'Identifier') {
          properties[keyNode.name] = getModelPropertyValue(valueNode);
        } else {
          console.error('parseModel error: Unknown ObjectProperty key', keyNode);
        }
      } else {
        console.error('parseModel error: Unknown ObjectExpression property', propPath.node);
      }
    });
  } else {
    console.error('parseModel error: Unknown argument', modelProps.node);
  }
};

const parseActions = (result, state) => {
  if (result.node.type === 'ObjectExpression') {
    result.node.properties.forEach((propNode, index) => {
      const propPath = result.get(`properties.${index}`);
      if (propPath.node.type === 'ObjectProperty') {
        const keyNode = propPath.node.key;
        const valueNode = propPath.node.value;
        if (keyNode.type === 'Identifier') {
          state[keyNode.name] = getModelMethods(valueNode);
        } else {
          console.error('parseActions error: Unknown ObjectProperty key', keyNode);
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
          console.error('parseActions error: Unknown ObjectMethod key', keyNode);
        }
      } else {
        console.error('parseActions error: Unknown ObjectExpression property', propPath.node);
      }
    });
  } else {
    console.error('parseActions error: unknown return argument', result.node);
  }
};

traverse(ast, {
  MemberExpression(path) {
    if (
      path.node.object.name === 'types' &&
      ['model', 'compose'].includes(path.node.property.name)
    ) {
      const modelStartPath = getModelStart(path);
      if (modelStartPath) {
        if (!pathModelMap.has(modelStartPath)) {
          const modelPath = modelStartPath;
          const model = new Model();
          const cloneNode = modelPath.node;
          modelPath.replaceWith(types.identifier(model.identifier));
          modelPath.node = cloneNode;
          pathModelMap.set(modelPath, model);
          identifierModelMap.set(model.identifier, model);
        }
      }
    }
  }
});

Array.from(pathModelMap.keys()).forEach((path, index) => {
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

  let parentModelStr = 'Object';
  model.inheret.forEach(inheritModel => {
    if (typeof inheritModel === 'string') {
      parentModelStr = inheritModel;
    } else {
      model.properties = Object.assign({}, model.properties, inheritModel.properties);
      model.actions = Object.assign({}, model.actions, inheritModel.actions);
      model.views = Object.assign({}, model.views, inheritModel.views);
    }
  });
  result.push(['@typedef', `{${parentModelStr}}`, model.name || model.identifier]);

  Object.entries(model.properties).forEach(([key, value]) => {
    const prop = getModelProp(key, value);
    let name = key;
    if (prop.optional) {
      name = `[${name}]`;
    }
    result.push(['@property', `{${prop.type}}`, name]);
  });
  Object.entries(model.actions).forEach(([key, value]) => {
    const prop = getActionProp(key, value);
    result.push(['@property', `{${prop.type}}`, key]);
  });
  Object.entries(model.views).forEach(([key, value]) => {
    const prop = getActionProp(key, value);
    result.push(['@property', `{${prop.type}}`, key]);
  });

  return `\n\n/**\n${result.map(line => `* ${line.join(' ')}`).join('\n')}\n*/`;
}

function getActionProp(key, prop) {
  if (!prop) {
    console.error('Unknown action', key, prop);
  }
  return {type: prop};
}

function getModelProp(key, type) {
  if (typeof type === 'string') {
    type = new ModelType(type);
  }
  return type.getProp();
}

function getFloatModelProps(model) {
  if (model.name) {
    return {type: model.name};
  }
  const result = [];
  Object.entries(model.properties).forEach(([key, value]) => {
    const prop = getModelProp(key, value);
    let name = key;
    if (prop.optional) {
      name = `[${name}]`;
    }
    result.push([name, prop.type]);
  });
  Object.entries(model.actions).forEach(([key, value]) => {
    const prop = getActionProp(key, value);
    result.push([key, prop.type]);
  });
  Object.entries(model.views).forEach(([key, value]) => {
    const prop = getActionProp(key, value);
    result.push([key, prop.type]);
  });
  return {type: `{${result.map(item => item.join(':')).join(',')}}`}
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
          return 'function:Promise'
        } else {
          return 'function';
        }
      }
      default: {
        console.error(`getModelMethods error: Node is not supported ${node.type}`, node);
      }
    }
  };
  return walk(node);
}

function getModelPropertyValue(node) {
  const walk = node => {
    switch (node.type) {
      case 'MemberExpression': {
        if (node.object.type === 'Identifier' && node.object.name === 'types') {
          return walk(node.property);
        } else {
          return {
            type: 'MemberExpression',
            object: walk(node.object),
            property: walk(node.property)
          };
        }
      }
      case 'Identifier': {
        const model = identifierModelMap.get(node.name);
        if (model) {
          model.ref = true;
          const type = new ModelType('model');
          type.model = model;
          return type;
        } else {
          return new ModelType(node.name);
        }
      }
      case 'CallExpression': {
        const type = walk(node.callee);
        if (type instanceof ModelType) {
          switch (type.type) {
            case 'array': {
              const argType = walk(node.arguments[0]);
              type.insert(argType);
              return type;
            }
            case 'map': {
              const argType = walk(node.arguments[0]);
              type.insert(argType);
              return type;
            }
            case 'optional': {
              type.insert(walk(node.arguments[0]));
              return type;
            }
            case 'maybeNull':
            case 'maybe': {
              type.insert(walk(node.arguments[0]));
              return type;
            }
            case 'enumeration':
            case 'literal': {
              type.insert(new ModelType('string'));
              return type;
            }
            case 'safeReference':
            case 'reference': {
              type.insert(walk(node.arguments[0]));
              return type;
            }
            case 'frozen': {
              const argType = new ModelType('*');
              argType.optional = true;
              type.insert(argType);
              return type;
            }
            case 'custom': {
              const objectExpression = node.arguments[0];
              let name = null;
              if (objectExpression.type === 'ObjectExpression') {
                objectExpression.properties.some(objectProperty => {
                  if (objectProperty.key.type === 'Identifier' && objectProperty.key.name === 'name') {
                    if (objectProperty.value.type === 'StringLiteral') {
                      name = objectProperty.value.value;
                      return true;
                    }
                  }
                })
              }
              const argType = new ModelType(name || '*');
              type.insert(argType);
              return type;
            }
            case 'refinement': {
              let subType = node.arguments[0];
              if (subType.type === 'StringLiteral') {
                subType = node.arguments[1];
              }
              type.insert(walk(subType));
              return type;
            }
            case 'late':
            case 'union': {
              const argType = new ModelType('*');
              type.insert(argType);
              return type;
            }
          }
        }
        return {
          type: 'CallExpression',
          callee: type,
          arguments: node.arguments.map(walk),
        };
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
        return new ModelType('function');
      }
      case 'StringLiteral': {
        return new ModelType('string');
      }
      case 'ArrayExpression': {
        return new ModelType('Array');
      }
      case 'BooleanLiteral': {
        return new ModelType('boolean');
      }
      case 'NumericLiteral': {
        return new ModelType('number');
      }
      default: {
        console.error(`getModelPropertyValue error: Node is not supported ${node.type}`, node);
      }
    }
  };
  return walk(node);
}

function getModelStart(path) {
  const goBack = path => {
    let parent = path.parentPath;
    if (parent.node.type === 'CallExpression') {
      let subParent = parent.parentPath;
      if (subParent.node.type === 'MemberExpression') {
        return goBack(subParent);
      } else {
        return parent;
      }
    } else {
      return path;
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