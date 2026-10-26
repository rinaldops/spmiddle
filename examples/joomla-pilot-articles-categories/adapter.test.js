import assert from "node:assert/strict";
import { createCategoriesRepository, listPublishedCategories } from "./adapter.js";
import { CATEGORIES_LIST_NAME, MSE_CATEGORIES_SCHEMA } from "./schema.js";

function fakeClient() {
  const calls = [];
  return {
    calls,
    getListItems: async (query) => {
      calls.push(query);
      const value = query.filter === "Published eq 'Published'"
        ? [{ Id: 10, Title: "Notícias", Alias: "noticias", Extension: "com_content", ParentId: 0, Level: 1, Ordering: 1, Published: "Published" }]
        : [
          { Id: 10, Title: "Notícias", Alias: "noticias", Extension: "com_content", ParentId: 0, Level: 1, Ordering: 1, Published: "Published" },
          { Id: 11, Title: "Rascunhos", Alias: "rascunhos", Extension: "com_content", ParentId: 0, Level: 2, Ordering: 2, Published: "Unpublished" }
        ];
      return {
        data: { value },
        status: 200
      };
    },
    getListItem: async () => ({ data: {} }),
    createListItem: async () => ({ data: {} }),
    updateListItem: async () => ({ data: {} }),
    deleteListItem: async () => ({})
  };
}

assert.equal(CATEGORIES_LIST_NAME, "mseCategories");
assert.equal(MSE_CATEGORIES_SCHEMA.internalName, "mseCategories");
assert.deepEqual(MSE_CATEGORIES_SCHEMA.indexes, [
  { fields: ["Alias"], unique: false },
  { fields: ["Extension"], unique: false },
  { fields: ["Published"], unique: false },
  { fields: ["Ordering"], unique: false }
]);

const client = fakeClient();
const repository = createCategoriesRepository({ client });
const categories = await listPublishedCategories({ repository, pageSize: 25 });

assert.deepEqual(categories, [{
  id: 10,
  title: "Notícias",
  alias: "noticias",
  extension: "com_content",
  parentId: 0,
  level: 1,
  ordering: 1,
  published: "Published"
}]);
assert.deepEqual(client.calls[0], {
  select: ["Id", "Title", "Alias", "Extension", "Description", "ParentId", "Level", "Ordering", "Published"],
  filter: "Published eq 'Published'",
  orderBy: [{ field: "Ordering", direction: "asc" }],
  top: 25
});
console.log("ok - categories pilot uses the mseCategories schema and fake transport");
