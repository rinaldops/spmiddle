/*
 * Dependency-free local integration example.
 *
 * It uses the public package modules against an in-memory transport.  No
 * network, tenant URL, credential, or real business data is required.
 */
import { fileURLToPath } from "node:url";
import { defineListSchema } from "../../packages/sharepoint-schema/src/index.js";
import { createProvisioningManager } from "../../packages/sharepoint-provisioning/src/index.js";
import { createMapper, createRepository } from "../../packages/data-core/src/index.js";
import {
  createDataSourceRegistry
} from "../../packages/sharepoint-rest-browser/src/index.js";

const site = "/sites/example";
const listTitle = "ExampleRecords";
const listPath = `lists/getbytitle('${listTitle}')`;
const listRoot = `${site}/_api/web/lists/getbytitle('${listTitle}')`;
const itemsRoot = `${listRoot}/items`;

const schema = defineListSchema({
  key: "records",
  internalName: "ExampleRecords",
  displayName: listTitle,
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", displayName: "Title", type: "Text", required: true },
    { internalName: "Notes", displayName: "Notes", type: "MultilineText" }
  ]
});

function notFound(message = "not found") {
  const error = new Error(message);
  error.code = "not-found";
  error.status = 404;
  return error;
}

function conflict(message = "ETag does not match") {
  const error = new Error(message);
  error.code = "concurrency-conflict";
  error.status = 412;
  return error;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** A tiny SharePoint-shaped transport with the same request contract. */
export function createMemoryTransport() {
  const state = {
    list: null,
    fields: [],
    items: new Map(),
    nextId: 1,
    nextVersion: 1
  };

  const etag = () => `"${state.nextVersion++}"`;
  const response = (data, status = 200, tag = null) => ({ data: clone(data), status, etag: tag });
  const itemIdFrom = (path) => Number(path.slice(itemsRoot.length + 1, -1));

  return {
    webUrl: site,
    state,
    async request(path, options = {}) {
      const method = String(options.method ?? "GET").toUpperCase();
      const body = options.body ?? {};

      if (method === "GET" && (path === `${listRoot}?$select=Id,Title,ListItemEntityTypeFullName` || path === listRoot)) {
        if (!state.list) throw notFound();
        return response(state.list);
      }
      if (method === "GET" && path === `${listRoot}/fields?$select=InternalName,StaticName,Title,TypeAsString,Required,Indexed,EnforceUniqueValues,Choices`) {
        if (!state.list) throw notFound();
        return response({ value: state.fields });
      }
      if (method === "GET" && path === `${listRoot}/indexes`) {
        if (!state.list) throw notFound();
        return response({ value: [] });
      }
      if (method === "POST" && path === `${site}/_api/web/lists`) {
        state.list = { Id: "00000000-0000-4000-8000-000000000001", Title: body.Title, BaseTemplate: body.BaseTemplate };
        return response(state.list, 201);
      }
      if (method === "POST" && path === `${listRoot}/fields`) {
        const typeNames = { 2: "Text", 3: "MultilineText" };
        const field = {
          InternalName: body.InternalName,
          StaticName: body.InternalName,
          Title: body.Title,
          TypeAsString: typeNames[body.FieldTypeKind] ?? "Text",
          Required: body.Required === true
        };
        state.fields.push(field);
        return response(field, 201);
      }
      if (method === "GET" && path.startsWith(`${itemsRoot}?`)) {
        return response({ value: [...state.items.values()].map(clone) });
      }
      if (method === "GET" && path === itemsRoot) {
        return response({ value: [...state.items.values()].map(clone) });
      }
      if (method === "POST" && path === itemsRoot) {
        const id = state.nextId++;
        const tag = etag();
        const item = { Id: id, ...clone(body), __etag: tag };
        state.items.set(id, item);
        return response(item, 201, tag);
      }
      if (path.startsWith(`${itemsRoot}(`) && path.endsWith(")")) {
        const id = itemIdFrom(path);
        const item = state.items.get(id);
        if (!item) throw notFound("item not found");
        if (method === "GET") return response(item, 200, item.__etag);
        if (options.etag !== item.__etag) throw conflict();
        if (method === "MERGE") {
          Object.assign(item, clone(body));
          item.__etag = etag();
          return response(item, 200, item.__etag);
        }
        if (method === "DELETE") {
          state.items.delete(id);
          return response(null, 204);
        }
      }
      throw new Error(`Unexpected ${method} ${path}`);
    }
  };
}

export function createExampleComposition() {
  const transport = createMemoryTransport();
  const registry = createDataSourceRegistry({
    allowedWebUrls: [site],
    transportFactory: () => transport,
    sources: [{ key: "records", webUrl: site, listPath }]
  });
  const listClient = registry.getListClient("records");
  const manager = createProvisioningManager({
    schema,
    transport: registry.getTransport("records"),
    listClient
  });
  const mapper = createMapper({
    mapping: {
      id: { internalName: "Id", readOnly: true },
      title: { internalName: "Title", required: true },
      notes: "Notes"
    }
  });
  const repository = createRepository({ source: "records", schema, mapper, client: listClient });
  return { schema, transport, registry, listClient, manager, repository };
}

export async function runExample() {
  const { manager, repository } = createExampleComposition();
  console.log("1. inspect (read-only)");
  console.dir(await manager.inspect(), { depth: null });
  console.log("2. explicit apply");
  console.dir(await manager.apply({ confirm: true }), { depth: null });
  console.log("3. verify");
  console.dir(await manager.verify(), { depth: null });
  console.log("4. create item");
  const created = await repository.create({ title: "Placeholder item", notes: "Placeholder notes" });
  console.dir(created, { depth: null });
  console.log("5. list items");
  console.dir(await repository.findMany({ select: ["id", "title", "notes"] }), { depth: null });
  console.log("6. update with ETag");
  const updated = await repository.update(created.id, { notes: "Updated placeholder notes" }, { etag: created.etag });
  console.dir(updated, { depth: null });
  console.log("7. delete with ETag");
  console.dir(await repository.delete(created.id, { etag: updated.etag }), { depth: null });
  console.log("Done: all operations ran against memory; no network request was made.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runExample();
}
