const ExampleStore = types.model('Example', {
  identifierType: types.identifier,
  identifierNumberType: types.identifierNumber,
  stringType: types.string,
  numberType: types.number,
  integerType: types.integer,
  booleanType: types.boolean,
  dateType: types.Date,
  modelNamedType: types.model('SomeModelName', {
    name: types.string,
  }),
  modelType: types.model({
    name: types.string,
  }),
  arrayOfStringType: types.array(types.string),
  mapType: types.map(ItemsMap),
  unionType: types.union({
    dispatcher: () => {}
  }, A, B, C),
  literalType: types.literal('a'),
  enumerationNamedType: types.enumeration('SomeEnumerationName', 'a', 'b', 'c'),
  enumerationType: types.enumeration('a', 'b', 'c'),
  refinementWithNameType: types.refinement('SomeRefinementName', types.string, value => value.length > 5),
  refinementType: types.refinement(types.string, value => value.length > 5),
  maybeStringType: types.maybe(types.string),
  maybeNullStringType: types.maybeNull(types.string),
  optionalStringType: types.optional(types.string),
  nullType: types.null,
  undefinedType: types.undefined,
  lateNamedType: types.late('SomeLateName', () => {}),
  lateType: types.late(() => {}),
  frozenType: types.frozen(),
  composeNamedType: types.compose('SomeComposeName', A, B),
  composeType: types.compose(C, D),
  referenceType: types.reference(SomeReference),
  customNamedType: types.custom({
    name: "Decimal"
  }),
  customType: types.custom({}),
}).actions(self => {
  return {
    get x() {

    },
    get y() {

    },
    set y(value) {

    },
    a() {

    },
    b: () => {

    },
    c: flow(function* () {

    }),
  };
}).views(self => {
  return {
    f: () => {},
    g() {

    }
  };
});

export default ExampleStore;