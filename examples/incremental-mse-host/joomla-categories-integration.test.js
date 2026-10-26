import assert from "node:assert/strict";
import { createIncrementalMseHost } from "./app.js";
import {
  createCategoriesRepository,
  createReadOnlyCategoriesClient,
  listPublishedCategories
} from "./joomla-categories-adapter.js";

const client = createReadOnlyCategoriesClient({
  items: [
    { Id: 2, Title: "Second", Alias: "second", Extension: "com_content", ParentId: 0, Level: 1, Ordering: 2, Published: "Published" },
    { Id: 1, Title: "First", Alias: "first", Extension: "com_content", ParentId: 0, Level: 1, Ordering: 1, Published: "Published" },
    { Id: 3, Title: "Draft", Alias: "draft", Extension: "com_content", ParentId: 0, Level: 1, Ordering: 3, Published: "Unpublished" }
  ]
});
const repository = createCategoriesRepository({ client });
const categories = await listPublishedCategories({ repository });

assert.deepEqual(categories.map((item) => item.title), ["First", "Second"]);
assert.equal(client.calls[0].query.filter, "Published eq 'Published'");
assert.deepEqual(client.calls[0].query.orderBy, [{ field: "Ordering", direction: "asc" }]);
assert.equal(client.calls[0].query.top, 100);

const transport = {
  calls: [],
  async request(action, payload) {
    this.calls.push({ action, payload });
    assert.equal(action, "query");
    return { items: categories };
  }
};
const host = createIncrementalMseHost({
  transport,
  initialState: { items: [], query: "", filter: null, layout: "list" }
});
const root = host.mount();
await host.dispatch({ type: "query", value: "" });

assert.equal(host.mount(), root);
assert.equal(host.metrics().rootMounts, 1);
assert.equal(host.metrics().fullNavigations, 0);
assert.deepEqual(host.getState().items, categories);
assert.equal(client.calls.some((call) => call.method !== "GET"), false);
assert.equal("createListItem" in client, true);

console.log("ok - Joomla categories repository feeds the incremental host read-only");
