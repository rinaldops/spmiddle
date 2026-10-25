import assert from "node:assert/strict";
import { createRepository } from "../src/index.js";
import { createMapper, mapItem, mapInput, mapCreate, mapUpdate } from "../src/mapper.js";
import { normalizeQuery, buildQuery } from "../src/query.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const mapping = {
  id: { internalName: "Id", readOnly: true },
  title: { internalName: "Title", required: true },
  status: "Status",
  createdAt: { internalName: "Created", readOnly: true }
};

function makeClient(responses = []) {
  const calls = [];
  return {
    calls,
    getListItems: async (query = {}) => {
      calls.push({ method: "getListItems", query });
      const response = responses.shift();
      return response ?? { data: { value: [] }, status: 200 };
    },
    getListItem: async (id, query = {}) => {
      calls.push({ method: "getListItem", id, query });
      return { data: { Id: id, Title: "Read", Status: "Published" }, etag: '"7"', status: 200 };
    },
    createListItem: async (values) => {
      calls.push({ method: "createListItem", values });
      return { data: { Id: 9, ...values }, etag: '"1"', status: 201 };
    },
    updateListItem: async (id, values, options = {}) => {
      calls.push({ method: "updateListItem", id, values, options });
      return { data: { Id: id, ...values }, etag: '"8"', status: 200 };
    },
    deleteListItem: async (id, options = {}) => {
      calls.push({ method: "deleteListItem", id, options });
      return { data: null, status: 204 };
    }
  };
}

const schema = { fields: [
  { internalName: "Id", required: true },
  { internalName: "Title", required: true },
  { internalName: "Status" }
] };

test("maps SharePoint fields to domain fields and validates inputs", () => {
  const mapper = createMapper({ mapping });
  assert.deepEqual(mapper.mapItem({ Id: 3, Title: "A", Status: "Published", Ignored: true }), {
    id: 3, title: "A", status: "Published"
  });
  assert.deepEqual(mapItem({ d: { Id: 4, Title: "B" } }, mapper), { id: 4, title: "B" });
  assert.deepEqual(mapInput({ title: "A", status: "Draft" }, mapper), { Title: "A", Status: "Draft" });
  assert.deepEqual(mapCreate({ title: "A" }, mapper), { Title: "A" });
  assert.deepEqual(mapUpdate({ status: "Published" }, mapper), { Status: "Published" });
  assert.throws(() => mapper.mapCreate({ status: "Draft" }), /obrigat/i);
  assert.throws(() => mapper.mapCreate({ title: "A", unknown: true }), /desconhecido/i);
  assert.throws(() => mapper.mapUpdate({ id: 3 }), /somente leitura/i);
});

test("normalizes only allow-listed select, filter and order fields", () => {
  const mapper = createMapper({ mapping });
  const query = normalizeQuery({
    select: ["id", "title", "status"],
    filter: { field: "status", operator: "eq", value: "Published" },
    orderBy: [{ field: "title", direction: "desc" }],
    pageSize: 20
  }, mapper);
  assert.deepEqual(query, {
    select: ["Id", "Title", "Status"],
    filter: "Status eq 'Published'",
    orderBy: [{ field: "Title", direction: "desc" }],
    top: 20
  });
  assert.deepEqual(buildQuery({ select: ["id"] }, mapper), { select: ["Id"] });
});

test("rejects unknown fields and unsafe query operators", () => {
  const mapper = createMapper({ mapping });
  assert.throws(() => normalizeQuery({ select: ["unknown"] }, mapper), /desconhecido/i);
  assert.throws(() => normalizeQuery({ orderBy: [{ field: "title", direction: "sideways" }] }, mapper), /asc|desc/i);
  assert.throws(() => normalizeQuery({ filter: { field: "title", operator: "raw", value: "x" } }, mapper), /suportado/i);
});

test("findById maps the item and forwards query options", async () => {
  const client = makeClient();
  const repository = createRepository({ source: "articles", mapper: createMapper({ mapping }), client });
  const item = await repository.findById(7, { select: ["id", "title"] });
  assert.deepEqual(item, { id: 7, title: "Read", status: "Published" });
  assert.deepEqual(client.calls[0], { method: "getListItem", id: 7, query: { select: ["Id", "Title"] } });
});

test("findMany controls the query, maps pages, and returns cursor metadata", async () => {
  const next = "/sites/demo/_api/web/lists(1)/items?$skiptoken=Paged%3DTRUE";
  const client = makeClient([
    { data: { value: [{ Id: 1, Title: "One", Status: "Draft" }], "@odata.nextLink": next }, status: 200 },
    { data: { value: [{ Id: 2, Title: "Two", Status: "Published" }] }, status: 200 }
  ]);
  const repository = createRepository({ source: "articles", mapper: createMapper({ mapping }), client });
  const result = await repository.findMany({
    select: ["id", "title"],
    filter: { field: "status", operator: "eq", value: "Published" },
    orderBy: [{ field: "title", direction: "asc" }],
    pageSize: 1
  });
  assert.deepEqual(result.items, [
    { id: 1, title: "One", status: "Draft" },
    { id: 2, title: "Two", status: "Published" }
  ]);
  assert.deepEqual(result.page, { hasMore: false, nextCursor: null });
  assert.deepEqual(client.calls[0].query, {
    select: ["Id", "Title"], filter: "Status eq 'Published'",
    orderBy: [{ field: "Title", direction: "asc" }], top: 1
  });
  assert.equal(client.calls[1].query.nextLink, next);
});

test("findMany detects repeated cursors and supports explicit page limits", async () => {
  const repeated = "/sites/demo/_api/web/lists(1)/items?$skiptoken=repeat";
  const loopClient = makeClient([
    { data: { value: [{ Id: 1, Title: "One" }], "@odata.nextLink": repeated }, status: 200 },
    { data: { value: [{ Id: 2, Title: "Two" }], "@odata.nextLink": repeated }, status: 200 }
  ]);
  const loopRepository = createRepository({ source: "articles", mapper: createMapper({ mapping }), client: loopClient });
  await assert.rejects(() => loopRepository.findMany({}, { maxPages: 10 }), (error) => error.code === "pagination-loop");

  const limitedClient = makeClient([
    { data: { value: [{ Id: 1, Title: "One" }], "@odata.nextLink": "/next" }, status: 200 },
    { data: { value: [{ Id: 2, Title: "Two" }], "@odata.nextLink": "/last" }, status: 200 }
  ]);
  const limitedRepository = createRepository({ source: "articles", mapper: createMapper({ mapping }), client: limitedClient });
  const result = await limitedRepository.findMany({}, { maxPages: 1, maxItems: 1 });
  assert.deepEqual(result.items, [{ id: 1, title: "One" }]);
  assert.equal(limitedClient.calls.length, 1);
  assert.equal(result.hasNextPage, true);
  await assert.rejects(() => limitedRepository.findMany({}, { maxPages: 0 }), /maxPages/i);
});

test("findMany uses bounded pagination defaults", async () => {
  let calls = 0;
  const client = {
    getListItems: async () => {
      calls += 1;
      return { data: { value: [], "@odata.nextLink": `/next-${calls}` } };
    },
    getListItem: async () => ({ data: {} }),
    createListItem: async () => ({ data: {} }),
    updateListItem: async () => ({ data: {} }),
    deleteListItem: async () => ({})
  };
  const repository = createRepository({ source: "tasks", client, mapper: createMapper({ mapping }) });
  const result = await repository.findMany({}, {});
  assert.equal(calls, 100);
  assert.equal(result.hasNextPage, true);
});

test("count returns the number of matching items", async () => {
  const client = makeClient([{ data: { value: [{ Id: 1 }, { Id: 2 }], "@odata.count": 2 }, status: 200 }]);
  const repository = createRepository({ source: "articles", mapper: createMapper({ mapping }), client });
  assert.equal(await repository.count({ filter: { field: "status", operator: "eq", value: "Draft" } }), 2);
  assert.equal(client.calls[0].query.select[0], "Id");
});

test("CRUD maps payloads and forwards exact ETags", async () => {
  const client = makeClient();
  const repository = createRepository({ source: "articles", mapper: createMapper({ mapping }), client });
  assert.deepEqual(await repository.create({ title: "New", status: "Draft" }), { id: 9, title: "New", status: "Draft" });
  assert.deepEqual(await repository.update(9, { title: "Changed" }, { etag: '"1"' }), { id: 9, title: "Changed" });
  assert.equal(await repository.delete(9, { etag: '"8"' }), undefined);
  assert.deepEqual(client.calls.slice(0, 3), [
    { method: "createListItem", values: { Title: "New", Status: "Draft" } },
    { method: "updateListItem", id: 9, values: { Title: "Changed" }, options: { etag: '"1"' } },
    { method: "deleteListItem", id: 9, options: { etag: '"8"' } }
  ]);
});

test("mapper can be derived from a schema", () => {
  const mapper = createMapper({ schema });
  assert.deepEqual(mapper.mapItem({ Id: 1, Title: "A", Status: "Draft" }), { Id: 1, Title: "A", Status: "Draft" });
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
