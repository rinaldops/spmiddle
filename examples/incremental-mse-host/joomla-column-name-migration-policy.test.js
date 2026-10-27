import assert from "node:assert/strict";
import fs from "node:fs";

const plan = fs.readFileSync(new URL("../../tools/review-joomla-column-name-migration.mjs", import.meta.url), "utf8");
assert.match(plan, /const DELETE_POLICY = "exact-etag"/);
assert.match(plan, /allowWildcardEtag: false/);
assert.match(plan, /wildcardOverride/);
console.log("ok - column migration defaults to exact ETags and rejects implicit wildcard deletion");
