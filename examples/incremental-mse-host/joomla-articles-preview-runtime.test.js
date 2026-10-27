import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("./mse-preview-joomla-articles-readonly-runtime.js", import.meta.url), "utf8");

assert.match(runtime, /mseContent/);
assert.match(runtime, /EditorialState/);
assert.match(runtime, /Publish_start/);
assert.match(runtime, /Publish_end/);
assert.match(runtime, /Created desc/);
assert.match(runtime, /method: "GET"/);
assert.doesNotMatch(runtime, /method: "POST"|method: "MERGE"|method: "DELETE"|X-RequestDigest|If-Match/);
assert.doesNotMatch(runtime, /Publish_x0020_start|Publish_x0020_end/);

console.log("ok - Joomla articles preview runtime is allowlisted and read-only");
