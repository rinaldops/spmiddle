import assert from "node:assert/strict";
import {
  ARTICLES_LIST_NAME,
  MSE_CONTENT_SCHEMA,
  createArticlesRepository,
  createReadOnlyArticlesClient,
  listPublishedArticles
} from "./joomla-articles-adapter.js";

assert.equal(ARTICLES_LIST_NAME, "mseContent");
assert.equal(MSE_CONTENT_SCHEMA.internalName, "mseContent");
assert.deepEqual(MSE_CONTENT_SCHEMA.indexes.map((index) => index.fields), [
  ["EditorialState"], ["Category"], ["Publish_start"], ["Publish_end"]
]);

const now = "2026-10-26T12:00:00.000Z";
const client = createReadOnlyArticlesClient({
  items: [
    { Id: 1, Created: "2026-10-25T10:00:00.000Z", Title: "Older", Alias: "older", EditorialState: "Published", Featured: false, PublishStart: null, PublishEnd: null, Category: "news" },
    { Id: 2, Created: "2026-10-26T10:00:00.000Z", Title: "Newer", Alias: "newer", EditorialState: "Published", Featured: true, PublishStart: "2026-10-01T00:00:00.000Z", PublishEnd: "2026-11-01T00:00:00.000Z", Category: "news" },
    { Id: 3, Created: "2026-10-24T10:00:00.000Z", Title: "Draft", Alias: "draft", EditorialState: "Unpublished", Featured: false, PublishStart: null, PublishEnd: null, Category: "news" },
    { Id: 4, Created: "2026-10-23T10:00:00.000Z", Title: "Expired", Alias: "expired", EditorialState: "Published", Featured: false, PublishStart: null, PublishEnd: "2026-10-01T00:00:00.000Z", Category: "news" }
  ]
});
const repository = createArticlesRepository({ client });
const articles = await listPublishedArticles({ repository, category: "news", count: 2, now });

assert.deepEqual(articles.map((item) => item.title), ["Newer", "Older"]);
assert.equal(client.calls[0].method, "GET");
assert.deepEqual(client.calls[0].query.select, ["Id", "Created", "Title", "Alias", "EditorialState", "Featured", "Publish_start", "Publish_end", "Category"]);
assert.match(client.calls[0].query.filter, /EditorialState eq 'Published'/);
assert.match(client.calls[0].query.filter, /Category eq 'news'/);
assert.deepEqual(client.calls[0].query.orderBy, [{ field: "Created", direction: "desc" }]);
assert.equal(client.calls[0].query.top, 2);

await assert.rejects(() => repository.create({ title: "blocked" }), /somente leitura/);
await assert.rejects(() => repository.update(1, { title: "blocked" }, { etag: "etag" }), /somente leitura/);
await assert.rejects(() => repository.delete(1, { etag: "etag" }), /artigos: escrita não permitida/);

console.log("ok - Joomla articles contract is allowlisted, bounded, read-only, and date-filtered");
