import assert from "node:assert/strict";
import { createDataSourceRegistry } from "../src/data-sources.js";

const listId = "67E55044-10B1-426F-9247-BB680E5FE0C8";
const transportCalls = [];
const transports = [];

function transportFactory(options) {
  transports.push(options);
  return {
    webUrl: options.webUrl,
    request: async (path, requestOptions = {}) => {
      transportCalls.push({ path, options: requestOptions });
      return { data: { value: [] }, status: 200 };
    }
  };
}

const registry = createDataSourceRegistry({
  allowedWebUrls: ["/teams/forum", "/teams/log-central/"],
  transportFactory,
  sources: [
    {
      key: "forum-topics",
      webUrl: "/teams/forum/",
      listId,
      title: "Forum topics",
      fields: ["Title", "Status"]
    },
    {
      key: "central-logs",
      webUrl: "/teams/log-central",
      listPath: "lists/getbytitle('Logs')",
      title: "Central logs"
    }
  ]
});

assert.deepEqual(registry.get("forum-topics"), {
  key: "forum-topics",
  webUrl: "/teams/forum",
  listId,
  title: "Forum topics",
  fields: ["Title", "Status"]
});
assert.equal(Object.isFrozen(registry.get("forum-topics")), true);
assert.equal(Object.isFrozen(registry.get("forum-topics").fields), true);
assert.equal(registry.has("forum-topics"), true);
assert.equal(registry.has("unknown-source"), false);
assert.deepEqual(registry.keys(), ["forum-topics", "central-logs"]);

const forumClient = registry.getListClient("forum-topics");
assert.equal(forumClient, registry.getListClient("forum-topics"));
await forumClient.getListItems({ select: ["Id"] });
assert.equal(transports.length, 1);
assert.deepEqual(transports[0], { webUrl: "/teams/forum" });
assert.equal(transportCalls[0].path, "/teams/forum/_api/web/lists(guid'67E55044-10B1-426F-9247-BB680E5FE0C8')/items?$select=Id");

const logClient = registry.getListClient("central-logs");
assert.equal(logClient, registry.getListClient("central-logs"));
await logClient.getListItems();
assert.equal(transports.length, 2);
assert.equal(transportCalls[1].path, "/teams/log-central/_api/web/lists/getbytitle('Logs')/items");

assert.throws(
  () => createDataSourceRegistry({
    allowedWebUrls: ["/teams/forum"],
    sources: [{ key: "outside", webUrl: "/teams/other", listId }]
  }),
  /allow|autoriz/i
);

assert.throws(
  () => createDataSourceRegistry({
    allowedWebUrls: ["https://tenant.example/teams/forum"],
    sources: []
  }),
  /server-relative|URL/i
);

assert.throws(
  () => createDataSourceRegistry({
    allowedWebUrls: ["/teams/forum"],
    sources: [
      { key: "same", webUrl: "/teams/forum", listId },
      { key: "same", webUrl: "/teams/forum", listPath: "lists/getbytitle('Other')" }
    ]
  }),
  /duplic|existe/i
);

const siteOnly = createDataSourceRegistry({
  allowedWebUrls: ["/teams/forum"],
  sources: [{ key: "site-only", webUrl: "/teams/forum" }]
});
assert.equal(siteOnly.getListClient("site-only"), undefined);

assert.equal(registry.get("https://evil.example/_api/web/lists(1)"), undefined);

console.log("data-sources.test.js: all checks passed");
