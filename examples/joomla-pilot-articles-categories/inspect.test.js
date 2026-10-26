import assert from "node:assert/strict";
import { createCategoriesInspectManager } from "./inspect.js";
import { MSE_DATA_WEB_URL } from "./source-policy.js";

const calls = [];
const transport = {
  webUrl: MSE_DATA_WEB_URL,
  async request(path, options) {
    calls.push({ path, options });
    const error = new Error("not found in fake transport");
    error.status = 404;
    throw error;
  }
};

const manager = createCategoriesInspectManager({ transport });
const plan = await manager.inspect();

assert.equal(plan.status, "missing");
assert.equal(plan.list.title, "mseCategories");
assert.equal(plan.actions[0].target, "mseCategories");
assert.ok(plan.actions.some((action) => action.target === "Published"));
assert.equal(calls[0].options.method, "GET");
assert.match(calls[0].path, /^\/teams\/camap-agp\/db\/_api\/web\/lists\/getbytitle\('mseCategories'\)/);
assert.equal(calls.some(({ options }) => options.method !== "GET"), false);

await assert.rejects(() => manager.apply(), /confirmação explícita/);
console.log("ok - inspect is read-only, allowlisted, and targets mseCategories in /db");
