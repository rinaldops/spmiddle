import { createProvisioningManager } from "../../packages/sharepoint-rest-browser/src/provisioning.js";
import { MSE_CATEGORIES_SCHEMA } from "./schema.js";
import { MSE_DATA_WEB_URL } from "./source-policy.js";

export function createCategoriesInspectManager({ transport } = {}) {
  return createProvisioningManager({
    schema: MSE_CATEGORIES_SCHEMA,
    transport: { ...transport, webUrl: MSE_DATA_WEB_URL }
  });
}
