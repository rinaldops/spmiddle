import { defineListSchema, validateJoomlaListName } from "../../packages/sharepoint-rest-browser/src/index.js";

export const CATEGORIES_LIST_NAME = validateJoomlaListName("mseCategories");

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

export const CATEGORIES_MAPPING = Object.freeze({
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
