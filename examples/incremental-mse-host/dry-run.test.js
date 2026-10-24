import assert from "node:assert/strict";
import { runIncrementalDryRun } from "./dry-run.js";

const report = await runIncrementalDryRun();

assert.equal(report.status, "pass");
assert.equal(report.mode, "local-dry-run");
assert.equal(report.fullReloads, 0);
assert.equal(report.rootRemounts, 0);
assert.equal(report.internalNavigations, 0);
assert.equal(report.rootMounts, 1);
assert.equal(report.rollback, "not-run");
assert.equal(report.affectedRegion, "items,items,items,layout");
assert.match(report.limitations, /fake host only/);
assert.deepEqual(report.requests.map(({ action }) => action), ["query", "filter", "update", "layout"]);
assert.doesNotThrow(() => JSON.stringify(report));

console.log("ok - incremental MSE dry-run produces sanitized runbook metrics without ASPX or browser access");
