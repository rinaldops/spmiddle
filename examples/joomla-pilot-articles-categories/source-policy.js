import { createDataSourceRegistry } from "../../packages/sharepoint-rest-browser/src/data-sources.js";

// Operational target approved for this migration. It is server-relative by
// design; no tenant hostname, GUID, credential, or browser session is stored.
export const MSE_DATA_WEB_URL = "/teams/camap-agp/db";
export const MSE_CATEGORIES_SOURCE_KEY = "mse-categories";

export function createMseCategoriesSourceRegistry({ transportFactory } = {}) {
  return createDataSourceRegistry({
    allowedWebUrls: [MSE_DATA_WEB_URL],
    transportFactory,
    sources: [{
      key: MSE_CATEGORIES_SOURCE_KEY,
      webUrl: MSE_DATA_WEB_URL,
      listPath: "lists/mseCategories"
    }]
  });
}
