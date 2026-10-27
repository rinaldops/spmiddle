import assert from "node:assert/strict";
import { MSE_CONTENT_SCHEMA } from "./joomla-articles-adapter.js";

const oldNames = ["Publish_x0020_start", "Publish_x0020_end"];
const newNames = ["Publish_start", "Publish_end"];
const dateFields = MSE_CONTENT_SCHEMA.fields.filter(({ type }) => type === "DateTime");
assert.deepEqual(dateFields.map(({ internalName }) => internalName), newNames);
assert.equal(oldNames.every((name) => /x0020/.test(name)), true);
assert.equal(newNames.every((name) => !/x0020|\s/.test(name)), true);
console.log("ok - article date field migration rejects x0020 names and uses underscore names");
