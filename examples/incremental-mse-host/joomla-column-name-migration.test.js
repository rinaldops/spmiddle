import assert from "node:assert/strict";
import { MSE_CATEGORIES_SCHEMA } from "./joomla-categories-adapter.js";
import { MSE_CONTENT_SCHEMA } from "./joomla-articles-adapter.js";

const expected = new Map([
  ["Parent category", "Parent_category"],
  ["Parameters (JSON)", "Parameters_JSON"],
  ["Publish start", "Publish_start"],
  ["Publish end", "Publish_end"]
]);
for (const schema of [MSE_CATEGORIES_SCHEMA, MSE_CONTENT_SCHEMA]) {
  for (const field of schema.fields) {
    if (!expected.has(field.displayName)) continue;
    assert.equal(field.internalName, expected.get(field.displayName));
    assert.equal(/\s|x0020/.test(field.internalName), false);
  }
}
console.log("ok - Joomla column names follow underscore convention without x0020 encoding");
