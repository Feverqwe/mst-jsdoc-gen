types.model('ExampleModel', {
  id: types.identifier,
  idNumber: types.identifierNumber,
  str: types.string,
  num: types.number,
  int: types.integer,
  bool: types.boolean,
  date: types.Date,
  someModel: types.model('TestModel', {
    name: types.string,
  }),
  someNonameModel: types.model({
    name: types.string,
  }),
  someArray: types.array(types.string),
  someMap: types.map(ItemsMap),
  union: types.union({
    dispatcher: () => {}
  }, A, B, C),
  literal: types.literal('a'),
  enumeration: types.enumeration('Name', 'a', 'b', 'c'),
  refinement: types.refinement('Name', types.string, value => value.length > 5),
  maybeString: types.maybe(types.string),
  maybeNullString: types.maybeNull(types.string),
  optionalString: types.optional(types.string),
  null: types.null,
  undefined: types.undefined,
  late: types.late(() => {}),
  frozen: types.frozen(),
  compose: types.compose('Compose', A, B),
  reference: types.reference(SomeModel),
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