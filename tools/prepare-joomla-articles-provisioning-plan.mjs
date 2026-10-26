import { createProvisioningManager } from "../packages/sharepoint-rest-browser/src/provisioning.js";
import { MSE_CONTENT_SCHEMA } from "../examples/incremental-mse-host/joomla-articles-adapter.js";

const TARGET_WEB = "/teams/camap-agp/db";
const calls = [];

// This transport deliberately simulates an empty target. It never connects to
// SharePoint; the purpose is to exercise the inspect/plan shape locally.
const transport = {
  webUrl: TARGET_WEB,
  calls,
  async request(path, options = {}) {
    calls.push({ path, method: options.method ?? "GET" });
    const error = new Error("simulated missing target");
    error.code = "not-found";
    error.status = 404;
    throw error;
  }
};

const manager = createProvisioningManager({ schema: MSE_CONTENT_SCHEMA, transport });
const plan = await manager.inspect();
const methods = calls.map(({ method }) => method.toUpperCase());

const report = {
  mode: "local-inspect-dry-run",
  status: "pass",
  source: TARGET_WEB,
  schema: {
    key: MSE_CONTENT_SCHEMA.key,
    internalName: MSE_CONTENT_SCHEMA.internalName,
    schemaVersion: MSE_CONTENT_SCHEMA.schemaVersion
  },
  observed: plan.status ?? "missing",
  proposedActionCount: plan.actions.length,
  proposedActionTypes: plan.actions.map((action) => action.type),
  requests: calls,
  writes: methods.filter((method) => method !== "GET").length,
  apply: "not-run",
  productionAccess: "not-run"
};

if (report.writes !== 0) throw new Error("inspect local não pode gerar chamadas de escrita.");
console.log(JSON.stringify(report, null, 2));
