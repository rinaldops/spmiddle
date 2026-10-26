import assert from "node:assert/strict";
import { createDataSourceRegistry } from "../../packages/sharepoint-rest-browser/src/data-sources.js";
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
assert.throws(() => createDataSourceRegistry({
  allowedWebUrls: [MSE_DATA_WEB_URL],
  transportFactory: () => ({ async request() {} }),
  sources: [{ key: "unexpected", webUrl: "/teams/other/db", listPath: "lists/mseCategories" }]
}), /allowedWebUrls/);
console.log("ok - source policy exposes only the approved /db origin");
