import {
  createMapper,
  createRepository,
  defineListSchema
} from "../../packages/sharepoint-rest-browser/src/index.js";

function validateArticlesListName(name) {
  if (name !== "mseContent") throw new TypeError("lista Joomla-like inválida para o piloto de artigos.");
  return name;
}

export const ARTICLES_LIST_NAME = validateArticlesListName("mseContent");

export const MSE_CONTENT_SCHEMA = defineListSchema({
  key: "mse-content",
  internalName: ARTICLES_LIST_NAME,
  displayName: ARTICLES_LIST_NAME,
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", displayName: "Title", type: "Text", required: true },
    { internalName: "Alias", displayName: "Alias", type: "Text", required: true },
    {
      internalName: "EditorialState",
      displayName: "Editorial state",
      type: "Choice",
      required: true,
      choices: ["Published", "Unpublished", "Archived", "Trashed"],
      defaultValue: "Unpublished"
    },
    { internalName: "Featured", displayName: "Featured", type: "Boolean", defaultValue: false },
    // The tenant derived these names from the display titles during the
    // initial UI-only bootstrap; changing them now would require destructive
    // cleanup.
    { internalName: "Publish_x0020_start", displayName: "Publish start", type: "DateTime" },
    { internalName: "Publish_x0020_end", displayName: "Publish end", type: "DateTime" },
    { internalName: "Category", displayName: "Category", type: "Text" }
  ],
  indexes: ["EditorialState", "Category", "PublishStart", "PublishEnd"]
});

const ARTICLES_MAPPING = Object.freeze({
  id: { internalName: "Id", readOnly: true },
  createdAt: { internalName: "Created", readOnly: true },
  title: { internalName: "Title", readOnly: true },
  alias: { internalName: "Alias", readOnly: true },
  editorialState: { internalName: "EditorialState", readOnly: true },
  featured: { internalName: "Featured", readOnly: true },
  publishStart: { internalName: "PublishStart", readOnly: true },
  publishEnd: { internalName: "PublishEnd", readOnly: true },
  category: { internalName: "Category", readOnly: true }
});

export function createArticlesRepository({ client } = {}) {
  return createRepository({
    source: ARTICLES_LIST_NAME,
    schema: MSE_CONTENT_SCHEMA,
    mapper: createMapper({ mapping: ARTICLES_MAPPING }),
    client
  });
}

function positiveCount(value) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError("count deve ser um inteiro positivo.");
  return value;
}

function dateValue(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${name} deve ser uma data válida.`);
  return date;
}

export async function listPublishedArticles({
  repository,
  category = null,
  count = 5,
  now = new Date()
} = {}) {
  if (!repository || typeof repository.findMany !== "function") {
    throw new TypeError("repository deve expor findMany().");
  }
  const limit = positiveCount(count);
  const current = dateValue(now, "now");
  const visibility = [
    { field: "editorialState", operator: "eq", value: "Published" },
    {
      or: [
        { field: "publishStart", operator: "eq", value: null },
        { field: "publishStart", operator: "le", value: current }
      ]
    },
    {
      or: [
        { field: "publishEnd", operator: "eq", value: null },
        { field: "publishEnd", operator: "ge", value: current }
      ]
    }
  ];
  if (category !== null && category !== undefined && category !== "") {
    visibility.push({ field: "category", operator: "eq", value: String(category) });
  }
  const result = await repository.findMany({
    select: ["id", "createdAt", "title", "alias", "editorialState", "featured", "publishStart", "publishEnd", "category"],
    filter: { and: visibility },
    orderBy: [{ field: "createdAt", direction: "desc" }],
    pageSize: limit
  }, { maxItems: limit });
  return result.items;
}

export function createReadOnlyArticlesClient({ items = [] } = {}) {
  const calls = [];
  return {
    calls,
    async getListItems(query) {
      calls.push({ method: "GET", query });
      const filter = String(query?.filter ?? "");
      const current = filter.match(/PublishStart le '([^']+)'/)?.[1] ?? new Date().toISOString();
      const category = filter.match(/Category eq '([^']+)'/)?.[1] ?? null;
      const visible = items
        .filter((item) => item.EditorialState === "Published")
        .filter((item) => !item.PublishStart || item.PublishStart <= current)
        .filter((item) => !item.PublishEnd || item.PublishEnd >= current)
        .filter((item) => category === null || item.Category === category)
        .sort((left, right) => String(right.Created).localeCompare(String(left.Created)));
      return { data: { value: visible } };
    },
    async getListItem() { throw new Error("artigos: leitura de item não usada no piloto"); },
    async createListItem() { throw new Error("artigos: escrita não permitida no piloto"); },
    async updateListItem() { throw new Error("artigos: escrita não permitida no piloto"); },
    async deleteListItem() { throw new Error("artigos: escrita não permitida no piloto"); }
  };
}
