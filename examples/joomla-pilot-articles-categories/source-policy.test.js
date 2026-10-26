import assert from "node:assert/strict";
import { createMseCategoriesSourceRegistry, MSE_DATA_WEB_URL, MSE_CATEGORIES_SOURCE_KEY } from "./source-policy.js";

const transports = [];
const registry = createMseCategoriesSourceRegistry({
  transportFactory({ webUrl }) {
    transports.push(webUrl);
    return { async request() {} };
  }
});

assert.deepEqual(registry.keys(), [MSE_CATEGORIES_SOURCE_KEY]);
assert.deepEqual(registry.get(MSE_CATEGORIES_SOURCE_KEY), {
  key: MSE_CATEGORIES_SOURCE_KEY,
  webUrl: MSE_DATA_WEB_URL,
  listPath: "lists/mseCategories"
});
assert.equal(registry.get("other-source"), undefined);
assert.equal(registry.getTransport(MSE_CATEGORIES_SOURCE_KEY).constructor, Object);
assert.deepEqual(transports, [MSE_DATA_WEB_URL]);
console.log("ok - source policy exposes only the approved /db origin");
