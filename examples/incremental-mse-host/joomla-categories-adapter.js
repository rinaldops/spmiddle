import {
  createMapper,
  createRepository,
  defineListSchema
} from "../../packages/sharepoint-rest-browser/src/index.js";

function validateCategoriesListName(name) {
  if (name !== "mseCategories") throw new TypeError("lista Joomla-like inválida para o piloto.");
  return name;
}

export const CATEGORIES_LIST_NAME = validateCategoriesListName("mseCategories");

export const MSE_CATEGORIES_SCHEMA = defineListSchema({
  key: "mse-categories",
  internalName: CATEGORIES_LIST_NAME,
  displayName: CATEGORIES_LIST_NAME,
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", displayName: "Title", type: "Text", required: true },
    { internalName: "Alias", displayName: "Alias", type: "Text", required: true },
    { internalName: "Extension", displayName: "Extension", type: "Text", required: true },
    { internalName: "Description", displayName: "Description", type: "Note" },
    { internalName: "ParentId", displayName: "Parent category", type: "Number", defaultValue: 0 },
    { internalName: "Level", displayName: "Level", type: "Number", defaultValue: 1 },
    { internalName: "Ordering", displayName: "Ordering", type: "Number", defaultValue: 0 },
    {
      internalName: "Published",
      displayName: "Published",
      type: "Choice",
      required: true,
      choices: ["Published", "Unpublished", "Trashed"],
      defaultValue: "Published"
    },
    { internalName: "ParamsJson", displayName: "Parameters (JSON)", type: "Note" }
  ],
  indexes: ["Alias", "Extension", "Published", "Ordering"]
});

const CATEGORIES_MAPPING = Object.freeze({
  id: { internalName: "Id", readOnly: true },
  title: { internalName: "Title", required: true },
  alias: { internalName: "Alias", required: true },
  extension: { internalName: "Extension", required: true },
  description: "Description",
  parentId: "ParentId",
  level: "Level",
  ordering: "Ordering",
  published: { internalName: "Published", required: true },
  paramsJson: "ParamsJson"
});

export function createCategoriesRepository({ client } = {}) {
  return createRepository({
    source: CATEGORIES_LIST_NAME,
    schema: MSE_CATEGORIES_SCHEMA,
    mapper: createMapper({ mapping: CATEGORIES_MAPPING }),
    client
  });
}

export async function listPublishedCategories({ repository, pageSize = 100 } = {}) {
  if (!repository || typeof repository.findMany !== "function") {
    throw new TypeError("repository deve expor findMany().");
  }
  const result = await repository.findMany({
    select: ["id", "title", "alias", "extension", "description", "parentId", "level", "ordering", "published"],
    filter: { field: "published", operator: "eq", value: "Published" },
    orderBy: [{ field: "ordering", direction: "asc" }],
    pageSize
  });
  return result.items;
}

export function createReadOnlyCategoriesClient({ items = [] } = {}) {
  const calls = [];
  const client = {
    calls,
    async getListItems(query) {
      calls.push({ method: "GET", query });
      const published = query?.filter === "Published eq 'Published'"
        ? items.filter((item) => item.Published === "Published")
        : items;
      const ordered = [...published].sort((left, right) => Number(left.Ordering || 0) - Number(right.Ordering || 0));
      return { data: { value: ordered } };
    },
    async getListItem() { throw new Error("categorias: leitura de item não usada no piloto"); },
    async createListItem() { throw new Error("categorias: escrita não permitida no piloto"); },
    async updateListItem() { throw new Error("categorias: escrita não permitida no piloto"); },
    async deleteListItem() { throw new Error("categorias: escrita não permitida no piloto"); }
  };
  return client;
}
