import assert from "node:assert/strict";
import { defineListSchema, validateListSchema, validateJoomlaListName } from "../src/schema.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function validSchema(overrides = {}) {
  return {
    key: " articles ",
    internalName: " AppArticles ",
    displayName: " Artigos ",
    template: 100,
    schemaVersion: 1,
    fields: [
      { internalName: " Title ", displayName: " Título ", type: " text ", required: true },
      { internalName: " Status ", type: " choice ", choices: [" Draft ", "Published"] }
    ],
    indexes: [[" Status "]],
    ...overrides
  };
}

test("normalizes a valid schema and deeply freezes the result", () => {
  const schema = defineListSchema(validSchema());

  assert.deepEqual(schema, {
    key: "articles",
    internalName: "AppArticles",
    displayName: "Artigos",
    template: 100,
    schemaVersion: 1,
    fields: [
      { internalName: "Title", displayName: "Título", type: "Text", required: true },
      { internalName: "Status", type: "Choice", choices: ["Draft", "Published"] }
    ],
    indexes: [{ fields: ["Status"], unique: false }]
  });
  assert.equal(Object.isFrozen(schema), true);
  assert.equal(Object.isFrozen(schema.fields), true);
  assert.equal(Object.isFrozen(schema.fields[1]), true);
  assert.equal(Object.isFrozen(schema.fields[1].choices), true);
  assert.equal(Object.isFrozen(schema.indexes[0]), true);
  assert.equal(Object.isFrozen(schema.indexes[0].fields), true);
  assert.throws(() => { schema.fields[0].internalName = "Changed"; }, TypeError);
  assert.throws(() => { schema.fields.push({}); }, TypeError);
});

test("rejects invalid list keys and internal names", () => {
  for (const key of ["", "1articles", "articles/records", "articles space"]) {
    assert.throws(() => defineListSchema(validSchema({ key })), /key.*inválid|key.*texto/i);
  }
  for (const internalName of ["", "1AppArticles", "App Articles", "App-Articles"]) {
    assert.throws(() => defineListSchema(validSchema({ internalName })), /internalName.*inválid|internalName.*texto/i);
  }
  assert.throws(() => defineListSchema(validSchema({ fields: [{ internalName: "Bad-Name", type: "Text" }] })), /internalName.*inválid/i);
});

test("rejects duplicate field internal names", () => {
  assert.throws(
    () => defineListSchema(validSchema({
      fields: [
        { internalName: "Title", type: "Text" },
        { internalName: "Title", type: "Number" }
      ]
    })),
    /duplicad/i
  );
});

test("requires a non-empty choices list for Choice fields", () => {
  for (const choices of [undefined, [], [""], ["Draft", "Draft"]]) {
    const field = { internalName: "Status", type: "Choice" };
    if (choices !== undefined) field.choices = choices;
    assert.throws(
      () => defineListSchema(validSchema({ fields: [field] })),
      /choices.*(obrigat|lista|duplicat)/i
    );
  }
  assert.throws(
    () => defineListSchema(validSchema({ fields: [{ internalName: "Title", type: "Text", choices: ["A"] }] })),
    /choices.*Choice/i
  );
});

test("rejects invalid indexes", () => {
  for (const indexes of [
    [["Unknown"]],
    [["Title", "Title"]],
    [{ fields: [] }],
    [{ fields: ["Title"], unique: "yes" }],
    [{ fields: ["Title"], unsupported: true }]
  ]) {
    assert.throws(() => defineListSchema(validSchema({ indexes })), /index/i);
  }
  assert.throws(() => defineListSchema(validSchema({ indexes: "Title" })), /index/i);
});

test("requires schemaVersion to be a positive integer", () => {
  for (const schemaVersion of [undefined, null, 0, -1, 1.5, "1", NaN, Infinity]) {
    assert.throws(() => defineListSchema(validSchema({ schemaVersion })), /schemaVersion/i);
  }
  assert.equal(validateListSchema(validSchema({ schemaVersion: 2 })).schemaVersion, 2);
});

test("defining a schema performs no network request", () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("network access is forbidden in schema tests");
  };
  try {
    defineListSchema(validSchema());
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validates Joomla-like list names before provisioning", () => {
  assert.equal(validateJoomlaListName("mseContent"), "mseContent");
  assert.equal(validateJoomlaListName("mseContentitemTagMap"), "mseContentitemTagMap");
  for (const invalid of ["MSEContent", "mse_content", "mse conteúdo", "mse", "MSE Publicacoes"]) {
    assert.throws(() => validateJoomlaListName(invalid), /nome da lista Joomla/);
  }
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
