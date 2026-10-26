import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MSE_CONTENT_SCHEMA } from "./joomla-articles-adapter.js";

assert.equal(MSE_CONTENT_SCHEMA.internalName, "mseContent");
assert.equal(MSE_CONTENT_SCHEMA.schemaVersion, 1);
assert.equal(MSE_CONTENT_SCHEMA.fields.find((field) => field.internalName === "EditorialState").defaultValue, "Unpublished");
assert.deepEqual(MSE_CONTENT_SCHEMA.fields.find((field) => field.internalName === "EditorialState").choices, ["Published", "Unpublished", "Archived", "Trashed"]);

const adapter = await readFile(new URL("./joomla-articles-adapter.js", import.meta.url), "utf8");
assert.match(adapter, /mseContent/);
assert.match(adapter, /EditorialState/);
assert.match(adapter, /PublishStart/);
assert.match(adapter, /PublishEnd/);
assert.match(adapter, /Created/);
assert.doesNotMatch(adapter, /CAMAPPublicacoes|MSEPublicacoes/);
assert.match(adapter, /createReadOnlyArticlesClient/);
assert.doesNotMatch(adapter, /POST|MERGE|DELETE|X-RequestDigest|If-Match/);

console.log("ok - Joomla articles schema keeps the first pilot local and read-only");
