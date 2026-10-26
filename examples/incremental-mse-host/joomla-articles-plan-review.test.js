import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createProvisioningManager } from "../../packages/sharepoint-rest-browser/src/provisioning.js";
import { MSE_CONTENT_SCHEMA } from "./joomla-articles-adapter.js";

const targetWeb = "/teams/camap-agp/db";
const calls = [];
const transport = {
  webUrl: targetWeb,
  async request(path, options = {}) {
    calls.push({ path, method: options.method ?? "GET" });
    const error = new Error("missing review fixture");
    error.code = "not-found";
    error.status = 404;
    throw error;
  }
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const plan = await createProvisioningManager({ schema: MSE_CONTENT_SCHEMA, transport }).inspect();
const fingerprint = createHash("sha256").update(canonical({ targetWeb, schema: MSE_CONTENT_SCHEMA, actions: plan.actions })).digest("hex");

assert.equal(fingerprint.length, 64);
assert.equal(plan.actions.length, 12);
assert.equal(plan.actions.filter((action) => action.type === "create-list").length, 1);
assert.equal(plan.actions.filter((action) => action.type === "create-field").length, 7);
assert.equal(plan.actions.filter((action) => action.type === "create-index").length, 4);
assert.equal(calls.every(({ method }) => method === "GET"), true);
assert.equal(calls.length, 1);

console.log("ok - Joomla articles plan review has a stable fingerprint and no writes");
