import { createHash } from "node:crypto";
import { MSE_CONTENT_SCHEMA } from "../examples/incremental-mse-host/joomla-articles-adapter.js";

const TARGET_WEB = "/teams/camap-agp/db";
const LIST_TITLE = MSE_CONTENT_SCHEMA.displayName;
const LIST_ROOT = `${TARGET_WEB}/_api/web/lists/getbytitle('${LIST_TITLE}')`;
const observed = { itemCount: 0, fields: [
  { internalName: "Publish_x0020_start", title: "Publish start", type: "DateTime", etag: "required-at-apply" },
  { internalName: "Publish_x0020_end", title: "Publish end", type: "DateTime", etag: "required-at-apply" }
] };

function xml(value) {
  return String(value).replace(/[&<>'\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", "\"": "&quot;" }[character]));
}
function dateFieldXml(name, title) {
  return `<Field Type="DateTime" Name="${xml(name)}" StaticName="${xml(name)}" DisplayName="${xml(title)}" Required="FALSE" />`;
}
const replacements = [
  { oldName: "Publish_x0020_start", newName: "Publish_start", displayName: "Publish start" },
  { oldName: "Publish_x0020_end", newName: "Publish_end", displayName: "Publish end" }
];
if (observed.itemCount !== 0) throw new Error("migração bloqueada: a lista não está vazia.");
for (const replacement of replacements) {
  const field = observed.fields.find(({ internalName }) => internalName === replacement.oldName);
  if (!field || field.type !== "DateTime") throw new Error(`campo legado inválido: ${replacement.oldName}`);
}
const actions = replacements.flatMap(({ oldName, newName, displayName }) => [
  { type: "delete-field", target: oldName, method: "DELETE", path: `${LIST_ROOT}/fields/getbyinternalnameortitle('${oldName}')`, etag: "required-at-apply" },
  { type: "create-field", target: newName, method: "POST", path: `${LIST_ROOT}/fields/createfieldasxml`, body: { parameters: { SchemaXml: dateFieldXml(newName, displayName), Options: 0 } } }
]);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const fingerprint = createHash("sha256").update(canonical({ targetWeb: TARGET_WEB, list: LIST_TITLE, observed, actions })).digest("hex");
console.log(JSON.stringify({ mode: "local-date-field-migration-review", status: "ready-for-explicit-structural-confirmation", target: { web: TARGET_WEB, list: LIST_TITLE }, preconditions: { itemCount: observed.itemCount, oldFields: replacements.map(({ oldName }) => oldName), writes: 0 }, actions, rollback: "interromper após qualquer falha; re-inspectar; não repetir sem comparar o fingerprint", fingerprint, apply: "not-run" }, null, 2));
