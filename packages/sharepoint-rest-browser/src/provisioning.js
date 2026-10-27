/*
 * Deliberative list provisioning.  This module intentionally uses only the
 * transport contract; it does not create anything while inspecting a site.
 * The returned plan is also useful to callers that want to present a review
 * screen before allowing writes.
 */

const FIELD_TYPES = Object.freeze({
  Text: 2, MultilineText: 3, Number: 9, Currency: 10, DateTime: 4,
  Boolean: 8, Choice: 6, Lookup: 7, User: 20, URL: 11, Integer: 9
});

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} deve ser um objeto.`);
  return value;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  return value?.value ?? value?.d?.results ?? value?.d ?? [];
}

function titleFor(schema) {
  return schema.displayName || schema.internalName || schema.key;
}

function quoteTitle(value) {
  return String(value).replace(/'/g, "''");
}

function listRoot(transport, title) {
  return `${transport.webUrl.replace(/\/+$/, "")}/_api/web/lists/getbytitle('${quoteTitle(title)}')`;
}

function fieldName(field) {
  return field.InternalName || field.StaticName || field.internalName || field.Name;
}

function xml(value) {
  return String(value).replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", "\"": "&quot;"
  }[character]));
}

function fieldXml(field) {
  const type = field.type === "MultilineText" ? "Note" : field.type;
  const attributes = [
    ["Type", type],
    ["Name", field.internalName],
    ["StaticName", field.internalName],
    ["DisplayName", field.displayName || field.internalName],
    ["Required", field.required === true ? "TRUE" : "FALSE"]
  ];
  if (field.type === "Choice") {
    attributes.push(["Format", "Dropdown"], ["FillInChoice", "FALSE"]);
  }
  if (field.defaultValue !== undefined) {
    const defaultValue = typeof field.defaultValue === "boolean" ? (field.defaultValue ? "1" : "0") : field.defaultValue;
    attributes.push(["Default", defaultValue]);
  }
  const head = attributes.map(([name, value]) => `${name}="${xml(value)}"`).join(" ");
  const choices = field.type === "Choice"
    ? `<CHOICES>${field.choices.map((choice) => `<CHOICE>${xml(choice)}</CHOICE>`).join("")}</CHOICES>`
    : "";
  return `<Field ${head}>${choices}</Field>`;
}

function sameIndex(index, expected) {
  const fields = index.fields || index.Fields || index.FieldNames || index.FieldName;
  const actual = Array.isArray(fields) ? fields : fields ? [fields] : [];
  const names = actual.map((field) => typeof field === "string" ? field : fieldName(field)).filter(Boolean);
  return names.length === expected.fields.length && expected.fields.every((name) => names.includes(name))
    && (expected.unique ? Boolean(index.unique ?? index.EnforceUniqueValues ?? index.Unique) : true);
}

function missingFieldAction(root, field) {
  const body = {
    parameters: {
      SchemaXml: fieldXml(field),
      Options: 0
    }
  };
  return {
    kind: "field", type: "create-field", target: field.internalName,
    method: "POST", path: `${root}/fields/createfieldasxml`, body
  };
}

function missingIndexAction(root, index) {
  // Index creation is kept as an explicit, narrow operation.  SharePoint
  // tenants differ in the exact FieldIndex payload they accept, so callers
  // can review/replace this action rather than receiving a broad migration.
  return {
    kind: "index", type: "create-index", target: index.fields.slice(), method: "POST",
    path: `${root}/indexes`, body: {
      __metadata: { type: "SP.Index" },
      FieldNames: { results: index.fields },
      IsUnique: index.unique === true
    }, supported: false,
    caveat: "A criação de índices REST depende da versão/tenant do SharePoint."
  };
}

function isNotFound(error) {
  return error?.status === 404 || error?.code === "not-found";
}

export function createProvisioningManager({ schema, transport, listClient, confirm } = {}) {
  object(schema, "schema");
  object(transport, "transport");
  if (typeof transport.request !== "function") throw new TypeError("transport.request deve ser uma função.");
  if (listClient !== undefined) object(listClient, "listClient");
  if (confirm !== undefined && typeof confirm !== "function" && confirm !== true) throw new TypeError("confirm deve ser uma função ou true.");
  const listTitle = titleFor(schema);
  if (typeof listTitle !== "string" || !listTitle.trim()) throw new TypeError("schema deve definir o nome da lista.");
  const title = listTitle.trim();
  const root = listRoot(transport, title);

  async function inspect() {
    let listResponse;
    try {
      listResponse = await transport.request(`${root}?$select=Id,Title,ListItemEntityTypeFullName`, { method: "GET" });
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return {
        status: "missing", missing: true,
        list: { exists: false, title }, fields: [], indexes: [],
        actions: [{ kind: "list", type: "create-list", target: title, method: "POST",
          path: `${transport.webUrl.replace(/\/+$/, "")}/_api/web/lists`,
          body: { __metadata: { type: "SP.List" }, Title: title, BaseTemplate: schema.template }},
          ...(schema.fields || []).map((field) => missingFieldAction(root, field)),
          ...(schema.indexes || []).map((index) => missingIndexAction(root, index))]
      };
    }
    const list = listResponse?.data?.d || listResponse?.data || {};
    let fieldsResponse;
    try {
      fieldsResponse = await transport.request(`${root}/fields?$select=InternalName,StaticName,Title,TypeAsString,Required,Indexed,EnforceUniqueValues,Choices`, { method: "GET" });
    } catch (error) { throw error; }
    let indexes = [];
    try {
      const indexResponse = await transport.request(`${root}/indexes`, { method: "GET" });
      indexes = arrayFrom(indexResponse?.data);
    } catch (error) {
      // Some SharePoint versions do not expose list indexes.  This is a
      // reviewable unknown, not permission to create one implicitly.
      if (!isNotFound(error)) throw error;
    }
    const fields = arrayFrom(fieldsResponse?.data);
    const byName = new Map(fields.map((field) => [fieldName(field), field]));
    const actions = [];
    for (const field of schema.fields || []) if (!byName.has(field.internalName)) actions.push(missingFieldAction(root, field));
    for (const index of schema.indexes || []) if (!indexes.some((existing) => sameIndex(existing, index))) actions.push(missingIndexAction(root, index));
    return { list: { exists: true, title, metadata: list }, fields, indexes, actions };
  }

  async function apply(options = {}) {
    const plan = await inspect();
    const approval = options.confirm ?? confirm;
    if (approval !== true && typeof approval !== "function") {
      const error = new Error("Provisioning exige confirmação explícita.");
      error.code = "confirmation-required";
      throw error;
    }
    if (typeof approval === "function" && !(await approval(plan))) {
      const error = new Error("Provisioning não foi confirmado.");
      error.code = "confirmation-denied";
      throw error;
    }
    const results = [];
    for (const action of plan.actions) {
      if (action.supported === false) {
        results.push({ action, status: "skipped", reason: "unsupported-rest-operation" });
        continue;
      }
      try {
        const response = await transport.request(action.path, { method: action.method, body: action.body });
        results.push({ action, status: "applied", response });
      } catch (error) { results.push({ action, status: "failed", error }); }
    }
    return { plan, results, status: results.some((item) => item.status === "failed") ? "failed" : "complete" };
  }

  async function verify() {
    const result = await inspect();
    return { ...result, compatible: result.actions.length === 0 };
  }

  return Object.freeze({ inspect, apply, verify });
}
