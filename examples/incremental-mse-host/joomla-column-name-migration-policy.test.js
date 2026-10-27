import assert from "node:assert/strict";
import fs from "node:fs";

const plan = fs.readFileSync(new URL("../../tools/review-joomla-column-name-migration.mjs", import.meta.url), "utf8");
assert.match(plan, /const DELETE_POLICY = "wildcard-etag-explicitly-authorized"/);
assert.match(plan, /allowWildcardEtag: true/);
assert.match(plan, /wildcardOverride/);
console.log("ok - column migration uses an explicitly authorized wildcard policy");
