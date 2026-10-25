import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(
  new URL("./mse-preview-camap-readonly-runtime.js", import.meta.url),
  "utf8"
);

// Keep the browser-only runtime covered locally without introducing a DOM or
// network dependency into the host test suite.
assert.match(runtime, /function dateTimestamp\(value\)/);
assert.match(runtime, /Number\.isFinite\(timestamp\) \? timestamp : null/);
assert.match(runtime, /left\.timestamp !== null/);
assert.match(runtime, /right\.timestamp !== null/);
assert.match(runtime, /return left\.index - right\.index;/);
assert.match(runtime, /state\.sort === "oldest"/);

// The query, category, and editorial-state predicates must remain conjunctive.
assert.match(runtime, /return matchesQuery && matchesCategory && matchesStatus;/);
assert.match(runtime, /DataPublicacao/);
assert.match(runtime, /escapeHtml\(item\.title\)/);
assert.doesNotMatch(runtime, /location\.reload|window\.location/);

console.log("ok - CAMAP runtime keeps combined filters, safe date ordering, escaping, and no reload fallback");
