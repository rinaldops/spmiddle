import { createHash } from "node:crypto";

const TARGET_WEB = "/teams/camap-agp/db";
const DELETE_POLICY = "exact-etag";
const observed = {
  mseCategories: {
    itemCount: 0,
    fields: [
      { oldName: "ParentId", newName: "Parent_category", title: "Parent category", type: "Number" },
      { oldName: "ParamsJson", newName: "Parameters_JSON", title: "Parameters (JSON)", type: "Note" }
    ]
  },
  mseContent: {
    itemCount: 0,
    fields: [
      { oldName: "Publish_x0020_start", newName: "Publish_start", title: "Publish start", type: "DateTime" },
      { oldName: "Publish_x0020_end", newName: "Publish_end", title: "Publish end", type: "DateTime" }
    ]
  }
};

function xml(value) {
  return String(value).replace(/[&<>'\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", "\"": "&quot;" }[character]));
}
function root(list) { return `${TARGET_WEB}/_api/web/lists/getbytitle('${list}')`; }
function schemaXml(field) {
  return `<Field Type="${xml(field.type)}" Name="${xml(field.newName)}" StaticName="${xml(field.newName)}" DisplayName="${xml(field.title)}" Required="FALSE" />`;
}
function actionsFor(list, definition) {
  const listRoot = root(list);
  return definition.fields.flatMap((field) => [
    { list, type: "create-field", target: field.newName, method: "POST", path: `${listRoot}/fields/createfieldasxml`, body: { parameters: { SchemaXml: schemaXml(field), Options: 0 } } },
    { list, type: "copy-field-values", target: `${field.oldName} → ${field.newName}`, method: "POST", path: `${listRoot}/items`, condition: `ItemCount > 0; copy ${field.oldName} to ${field.newName} per item using exact item ETag` },
    { list, type: "delete-field", target: field.oldName, method: "DELETE", path: `${listRoot}/fields/getbyinternalnameortitle('${field.oldName}')`, etag: "required-at-apply", allowWildcardEtag: false }
  ]);
}
const actions = Object.entries(observed).flatMap(([list, definition]) => actionsFor(list, definition));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const fingerprint = createHash("sha256").update(canonical({ targetWeb: TARGET_WEB, deletePolicy: DELETE_POLICY, observed, actions })).digest("hex");
console.log(JSON.stringify({
  mode: "local-column-name-migration-review",
  status: "ready-for-explicit-structural-confirmation",
  convention: "spaces become underscores; no x0020 encoding",
  deletePolicy: DELETE_POLICY,
  targetWeb: TARGET_WEB,
  preconditions: Object.fromEntries(Object.entries(observed).map(([list, value]) => [list, { itemCount: value.itemCount, writes: 0 }])),
  actions,
  ordering: "create → copy values with exact item ETag → verify → delete legacy field → verify",
  rollback: "stop on failure; re-inspect; retain legacy field until copy verification succeeds",
  wildcardOverride: "not authorized; requires separate explicit confirmation and a new fingerprint",
  fingerprint,
  apply: "not-run"
}, null, 2));
