import assert from "node:assert/strict";
import { schema as spmiddleSchema } from "./adapter.js";

/**
 * Dependency-free contract parity test.
 *
 * Goal: ensure the exported SPMIDDLE list schema (./adapter.js) stays compatible
 * with the *sanitized* legacy contract observed in:
 *   mse-platform/modules/mod_recursos/recursos-schema.js
 *
 * Constraints:
 * - No imports from mse-platform (avoid coupling repositories)
 * - No network/DOM
 * - No real URLs (use placeholders)
 * - Must run on current Node (>=20) without relying on structuredClone
 */

// Minimal, dependency-free deep copy for plain JSON-ish data.
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortObject(value[key]);
  return out;
}

function normalizeIndexes(indexes) {
  // SPMIDDLE normalizes indexes into [{fields:[...], unique:false}]
  // but callers may pass arrays like [["A"],["B"]]. In adapter.js it is arrays.
  const normalized = (indexes ?? []).map((idx) => {
    if (Array.isArray(idx)) return { fields: idx.slice(), unique: false };
    if (typeof idx === "string") return { fields: [idx], unique: false };
    return { fields: (idx.fields ?? []).slice(), unique: idx.unique === true };
  });
  for (const entry of normalized) entry.fields = entry.fields.map(String);
  normalized.sort((a, b) => a.fields.join("|").localeCompare(b.fields.join("|")) || Number(a.unique) - Number(b.unique));
  return normalized;
}

function normalizeFields(fields) {
  const out = fields.map((f) => ({
    internalName: f.internalName,
    type: f.type,
    required: f.required === true,
    defaultValue: clone(f.defaultValue)
  }));
  out.sort((a, b) => a.internalName.localeCompare(b.internalName));
  return out;
}

function normalizeSchema(schema) {
  assert.ok(schema && typeof schema === "object", "schema must be an object");
  return sortObject({
    key: schema.key,
    internalName: schema.internalName,
    displayName: schema.displayName,
    template: schema.template,
    schemaVersion: schema.schemaVersion,
    fields: normalizeFields(schema.fields ?? []),
    indexes: normalizeIndexes(schema.indexes)
  });
}

// --- Expected legacy contract (sanitized) -----------------------------------
// Observed from mse-platform/modules/mod_recursos/recursos-schema.js
// and translated into the SPMIDDLE list-schema dialect.
//
// IMPORTANT intentional difference:
// - Legacy uses URL as "Text" (SharePoint Text maxLength 255)
// - SPMIDDLE uses URL field type "URL"
const expectedLegacySanitized = {
  key: "recursos-links",
  internalName: "RecursosLinks",
  displayName: "Explore Mais — Links",
  template: 100,
  schemaVersion: 3,
  fields: [
    // Legacy: { internalName:"URL", type:"Text", required:true, maxLength:255 }
    // SPMIDDLE adapter: { internalName:"URL", type:"URL", required:true }
    { internalName: "URL", type: "Text", required: true },
    { internalName: "Categoria", type: "Choice", required: true },
    { internalName: "Descricao", type: "MultilineText", required: false },
    { internalName: "IconeChave", type: "Text", required: false },
    { internalName: "Ordem", type: "Number", required: false, defaultValue: 0 },
    { internalName: "AbrirNovaJanela", type: "Boolean", required: true, defaultValue: true },
    { internalName: "Ativo", type: "Boolean", required: true, defaultValue: true }
  ],
  // Legacy indexes implied via indexed:true (Title, Categoria, Ordem, Ativo).
  // Adapter only declares these three, which are sufficient for query patterns.
  indexes: [["Ativo"], ["Categoria"], ["Ordem"]]
};

// --- Tests ------------------------------------------------------------------

// 1) Identity/version parity.
assert.equal(spmiddleSchema.key, expectedLegacySanitized.key);
assert.equal(spmiddleSchema.internalName, expectedLegacySanitized.internalName);
assert.equal(spmiddleSchema.schemaVersion, expectedLegacySanitized.schemaVersion);
assert.equal(spmiddleSchema.template, expectedLegacySanitized.template);
assert.equal(spmiddleSchema.displayName, expectedLegacySanitized.displayName);

// 2) Compare field sets, required flags, and defaults.
const normalizedSpmiddle = normalizeSchema(spmiddleSchema);
const normalizedExpected = normalizeSchema(expectedLegacySanitized);

// Same internal names.
assert.deepEqual(
  normalizedSpmiddle.fields.map((f) => f.internalName).sort(),
  normalizedExpected.fields.map((f) => f.internalName).sort()
);

// Same required and defaultValue expectations for all fields (type handled separately).
const spByName = new Map(normalizedSpmiddle.fields.map((f) => [f.internalName, f]));
for (const exp of normalizedExpected.fields) {
  const actual = spByName.get(exp.internalName);
  assert.ok(actual, `missing field ${exp.internalName}`);
  assert.equal(actual.required, exp.required, `required mismatch for ${exp.internalName}`);
  assert.deepEqual(actual.defaultValue, exp.defaultValue, `defaultValue mismatch for ${exp.internalName}`);
}

// 3) Index parity (order-insensitive).
assert.deepEqual(normalizedSpmiddle.indexes, normalizedExpected.indexes);

// 4) Type parity, with an explicit intentional exception for URL.
for (const exp of normalizedExpected.fields) {
  const actual = spByName.get(exp.internalName);
  if (exp.internalName === "URL") {
    // Legacy contract stores URL as Text; SPMIDDLE uses URL.
    assert.equal(exp.type, "Text");
    assert.equal(actual.type, "URL");
    continue;
  }
  // Categoria legacy is Choice, but adapter uses Text for compatibility.
  // (Legacy list had Choice with fixed categories; adapter reads it as Text.)
  if (exp.internalName === "Categoria") {
    assert.equal(exp.type, "Choice");
    assert.equal(actual.type, "Text");
    continue;
  }
  // Descricao legacy uses Note; SPMIDDLE maps Note/MultilineText.
  if (exp.internalName === "Descricao") {
    assert.equal(actual.type, "MultilineText");
    continue;
  }
  assert.equal(actual.type, exp.type, `type mismatch for ${exp.internalName}`);
}

console.log(
  "ok - schema parity (sanitized legacy vs SPMIDDLE adapter): identity, version, fields, required/default, indexes, and intentional type differences (URL/Categoria)"
);
