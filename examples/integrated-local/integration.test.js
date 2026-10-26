import assert from "node:assert/strict";
import * as app from "./app.js";
import {
  defineListSchema,
  createDataSourceRegistry,
  createProvisioningManager
} from "../../packages/sharepoint-rest-browser/src/index.js";

// Importing the example is intentional: it is the executable integration
// sample.  Keep this test independent of external services and dependencies.
assert.equal(typeof app, "object");

const site = "/sites/integration-test";
const title = "IntegrationRecords";
const listPath = `lists/getbytitle('${title}')`;
const listRoot = `${site}/_api/web/lists/getbytitle('${title}')`;
const itemsRoot = `${listRoot}/items`;
const schema = defineListSchema({
  key: "records",
  internalName: "IntegrationRecords",
  displayName: title,
  template: 100,
  schemaVersion: 1,
  fields: [{ internalName: "Title", type: "Text", required: true }]
});

function errorWith(code, status, message = code) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function memoryTransport() {
  const state = { list: null, fields: [], items: new Map(), nextId: 1, version: 1 };
  const calls = [];
  const nextEtag = () => `"${state.version++}"`;
  const result = (data, status = 200, etag = null) => ({ data: copy(data), status, etag });
  const itemId = (path) => Number(path.slice(itemsRoot.length + 1, -1));

  return {
    webUrl: site, state, calls,
    async request(path, options = {}) {
      calls.push({ path, options });
      const method = String(options.method ?? "GET").toUpperCase();
      const body = options.body ?? {};
      if (method === "GET" && (path === listRoot || path.startsWith(`${listRoot}?$select=`))) {
        if (!state.list) throw errorWith("not-found", 404);
        return result(state.list);
      }
      if (method === "GET" && path.startsWith(`${listRoot}/fields`)) {
        if (!state.list) throw errorWith("not-found", 404);
        return result({ value: state.fields });
      }
      if (method === "GET" && path === `${listRoot}/indexes`) {
        if (!state.list) throw errorWith("not-found", 404);
        return result({ value: [] });
      }
      if (method === "POST" && path === `${site}/_api/web/lists`) {
        state.list = { Id: "list-1", Title: body.Title, BaseTemplate: body.BaseTemplate };
        return result(state.list, 201);
      }
      if (method === "POST" && path === `${listRoot}/fields/createfieldasxml`) {
        const schemaXml = body.parameters?.SchemaXml ?? "";
        const field = {
          InternalName: schemaXml.match(/Name="([^"]+)"/)?.[1],
          TypeAsString: schemaXml.match(/Type="([^"]+)"/)?.[1] ?? "Text",
          Required: /Required="TRUE"/.test(schemaXml)
        };
        state.fields.push(field);
        return result(field, 201);
      }
      if (method === "GET" && (path === itemsRoot || path.startsWith(`${itemsRoot}?`))) {
        return result({ value: [...state.items.values()] });
      }
      if (method === "POST" && path === itemsRoot) {
        const id = state.nextId++;
        const etag = nextEtag();
        const item = { Id: id, ...copy(body), __etag: etag };
        state.items.set(id, item);
        return result(item, 201, etag);
      }
      if (path.startsWith(`${itemsRoot}(`) && path.endsWith(")")) {
        const item = state.items.get(itemId(path));
        if (!item) throw errorWith("not-found", 404);
        if (method === "GET") return result(item, 200, item.__etag);
        if (options.etag !== item.__etag) throw errorWith("concurrency-conflict", 412);
        if (method === "MERGE") {
          Object.assign(item, copy(body));
          item.__etag = nextEtag();
          return result(item, 200, item.__etag);
        }
        if (method === "DELETE") {
          state.items.delete(item.Id);
          return result(null, 204);
        }
      }
      throw new Error(`Unexpected ${method} ${path}`);
    }
  };
}

const transport = memoryTransport();
const registry = createDataSourceRegistry({
  allowedWebUrls: [site],
  transportFactory: () => transport,
  sources: [{ key: "records", webUrl: site, listPath }]
});
const listClient = registry.getListClient("records");
const manager = createProvisioningManager({ schema, transport, listClient });

assert.throws(() => defineListSchema({ ...schema, fields: [{ internalName: "Bad-Name", type: "Text" }] }), /invalid|inválid|campos/i);
assert.throws(() => createDataSourceRegistry({ allowedWebUrls: [site], sources: [{ key: "bad", webUrl: "/sites/other", listPath }] }), /allowlist|allowedWebUrls/i);
assert.equal(registry.get("https://evil.example/_api"), undefined);

const beforeInspect = transport.calls.length;
const plan = await manager.inspect();
assert.equal(plan.status, "missing");
assert.equal(transport.calls.slice(beforeInspect).some(({ options }) => options.method !== "GET"), false);
await assert.rejects(() => manager.apply(), /confirm|confirma/i);
assert.equal(transport.calls.some(({ options }) => options.method !== "POST" && options.method !== "GET"), false);

const applied = await manager.apply({ confirm: true });
assert.equal(applied.status, "complete");
assert.equal((await manager.verify()).compatible, true);

const created = await listClient.createListItem({ Title: "Created" });
assert.equal(created.status, 201);
const read = await listClient.getListItem(created.data.Id);
assert.equal(read.etag, created.etag);
const updated = await listClient.updateListItem(created.data.Id, { Title: "Updated" }, { etag: read.etag });
assert.notEqual(updated.etag, read.etag);
await assert.rejects(() => listClient.deleteListItem(created.data.Id, { etag: read.etag }), /ETag|concurr|match/i);
await listClient.deleteListItem(created.data.Id, { etag: updated.etag });
assert.deepEqual((await listClient.getListItems()).data.value, []);

console.log("ok - integrated local schema, registry, provisioning, verification, ETag CRUD, and cleanup");
