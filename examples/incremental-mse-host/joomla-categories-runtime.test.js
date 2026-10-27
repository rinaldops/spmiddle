import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(
  new URL("./mse-preview-joomla-categories-readonly-runtime.js", import.meta.url),
  "utf8"
);

assert.match(runtime, /data-spmiddle-mse-root/);
assert.match(runtime, /data-spmiddle-instance="preview"/);
assert.match(runtime, /\/teams\/camap-agp\/db/);
assert.match(runtime, /mseCategories/);
assert.match(runtime, /findMany/);
assert.match(runtime, /SPMIDDLE_CATEGORIES_REPOSITORY/);
  assert.match(runtime, /Id.*Title.*Alias.*Extension.*Description.*Parent_category.*Level.*Ordering.*Published/);
assert.match(runtime, /Published%20eq%20%27Published%27/);
assert.match(runtime, /Ordering%20asc/);
assert.match(runtime, /method: "GET"/);
assert.match(runtime, /credentials: "same-origin"/);
assert.doesNotMatch(runtime, /POST|MERGE|DELETE|X-RequestDigest|If-Match/);
assert.doesNotMatch(runtime, /MSE Publicacoes|CAMAPPublicacoes|location\.reload|window\.location/);
assert.match(runtime, /joomlaCategoriesMounted/);
assert.match(runtime, /data-spmiddle-categories-region/);

console.log("ok - Joomla categories extension is allowlisted, read-only, isolated, and incremental");
