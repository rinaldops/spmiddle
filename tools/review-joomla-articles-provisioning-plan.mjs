import { createHash } from "node:crypto";
import { createProvisioningManager } from "../packages/sharepoint-rest-browser/src/provisioning.js";
import { MSE_CONTENT_SCHEMA } from "../examples/incremental-mse-host/joomla-articles-adapter.js";

const TARGET_WEB = "/teams/camap-agp/db";
const calls = [];

const transport = {
  webUrl: TARGET_WEB,
  async request(path, options = {}) {
    calls.push({ path, method: options.method ?? "GET" });
    const error = new Error("simulated missing target");
    error.code = "not-found";
    error.status = 404;
    throw error;
  }
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const manager = createProvisioningManager({ schema: MSE_CONTENT_SCHEMA, transport });
const plan = await manager.inspect();
const fingerprintInput = {
  targetWeb: TARGET_WEB,
  schema: MSE_CONTENT_SCHEMA,
  actions: plan.actions
};
const fingerprint = createHash("sha256").update(canonical(fingerprintInput)).digest("hex");
const writes = calls.filter(({ method }) => method.toUpperCase() !== "GET");

const report = {
  mode: "local-administrative-review",
  reviewStatus: "ready-for-explicit-apply-confirmation",
  target: {
    web: TARGET_WEB,
    list: MSE_CONTENT_SCHEMA.internalName,
    observed: "missing"
  },
  schemaVersion: MSE_CONTENT_SCHEMA.schemaVersion,
  fingerprint,
  actions: {
    total: plan.actions.length,
    createList: plan.actions.filter((action) => action.type === "create-list").length,
    createFields: plan.actions.filter((action) => action.type === "create-field").map((action) => action.target),
    createIndexes: plan.actions.filter((action) => action.type === "create-index").map((action) => action.target),
    destructive: false,
    indexCaveats: plan.actions.filter((action) => action.type === "create-index").map((action) => action.caveat)
  },
  safety: {
    inspectRequests: calls,
    inspectWrites: writes.length,
    apply: "not-run",
    productionDataWrites: "not-run",
    permissionsChanged: false,
    runtimePublished: false
  },
  rollback: [
    "não inserir dados durante o provisioning",
    "se houver aplicação parcial, interromper e re-inspecionar antes de repetir",
    "remover somente a estrutura nova confirmada pelo fingerprint, se autorizado",
    "executar inspect/verify após a compensação"
  ],
  decisionRequired: "aprovação explícita do plano e do fingerprint antes de apply"
};

if (writes.length !== 0) throw new Error("revisão de inspect não pode conter escritas.");
console.log(JSON.stringify(report, null, 2));
