import { createMapper, createRepository } from "../../packages/sharepoint-rest-browser/src/index.js";
import { CATEGORIES_LIST_NAME, CATEGORIES_MAPPING, MSE_CATEGORIES_SCHEMA } from "./schema.js";

export function createCategoriesRepository({ client } = {}) {
  const mapper = createMapper({ mapping: CATEGORIES_MAPPING });
  return createRepository({
    source: CATEGORIES_LIST_NAME,
    schema: MSE_CATEGORIES_SCHEMA,
    mapper,
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
