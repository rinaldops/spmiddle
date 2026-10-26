import assert from "node:assert/strict";
import { createProvisioningManager } from "../../packages/sharepoint-rest-browser/src/provisioning.js";
import { MSE_CONTENT_SCHEMA } from "./joomla-articles-adapter.js";

const calls = [];
const transport = {
  webUrl: "/teams/camap-agp/db",
  async request(path, options = {}) {
    calls.push({ path, method: options.method ?? "GET" });
    const error = new Error("missing local fixture");
    error.code = "not-found";
    error.status = 404;
    throw error;
  }
};

const plan = await createProvisioningManager({ schema: MSE_CONTENT_SCHEMA, transport }).inspect();

assert.equal(plan.status, "missing");
assert.equal(calls.length, 1);
assert.equal(calls[0].method, "GET");
assert.match(calls[0].path, /getbytitle\('mseContent'\)/);
assert.equal(plan.actions[0].type, "create-list");
assert.equal(plan.actions[0].target, "mseContent");
assert.ok(plan.actions.some((action) => action.type === "create-field" && action.target === "EditorialState"));
assert.ok(plan.actions.some((action) => action.type === "create-index" && action.target.includes("EditorialState")));
assert.equal(calls.some(({ method }) => method !== "GET"), false);

console.log("ok - Joomla articles provisioning plan is local, read-only, and reviewable");
