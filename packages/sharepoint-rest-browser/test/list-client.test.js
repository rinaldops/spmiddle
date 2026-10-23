import assert from "node:assert/strict";
import { createSharePointListClient } from "../src/list-client.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function fakeTransport(responses = []) {
  const calls = [];
  return {
    calls,
    webUrl: site,
    request: async (path, options = {}) => {
      calls.push({ path, options });
      const response = responses.shift();
      if (typeof response === "function") return response(path, options);
      return response ?? { data: null, status: 204, etag: null };
    }
  };
}

const site = "/sites/demo";
const listPath = `${site}/_api/web/lists/getbytitle('Tasks')/items`;

test("constructs list and item URLs and serializes select/expand/filter/orderby/top", async () => {
  const transport = fakeTransport([{ data: { value: [] }, status: 200 }]);
  const client = createSharePointListClient({ transport, listPath: "lists/getbytitle('Tasks')" });

  await client.getListItems({
    select: ["Id", "Title"],
    expand: ["Author"],
    filter: "Status eq 'Open'",
    orderBy: [{ field: "Title", direction: "asc" }],
    top: 10
  });

  assert.equal(
    transport.calls[0].path,
    `${listPath}?$select=Id%2CTitle&$expand=Author&$filter=Status%20eq%20'Open'&$orderby=Title%20asc&$top=10`
  );
});

test("returns a page and follows a same-site odata.nextLink", async () => {
  const nextLink = `${listPath}?$skiptoken=Paged%3DTRUE%26p_ID%3D2`;
  const transport = fakeTransport([
    { data: { value: [{ Id: 1 }], "odata.nextLink": nextLink }, status: 200 },
    { data: { value: [{ Id: 2 }] }, status: 200 }
  ]);
  const client = createSharePointListClient({ transport, listPath: "lists/getbytitle('Tasks')" });

  const first = await client.getListItems({ top: 1 });
  assert.deepEqual(first.data.value, [{ Id: 1 }]);
  assert.equal(first.data["odata.nextLink"], nextLink);
  const second = await client.getListItems({ nextLink: first.data["odata.nextLink"] });
  assert.deepEqual(second.data.value, [{ Id: 2 }]);
  assert.equal(transport.calls[1].path, nextLink);
});

test("gets an item by ID", async () => {
  const transport = fakeTransport([{ data: { Id: 7, Title: "Read me" }, etag: '"3"', status: 200 }]);
  const client = createSharePointListClient({ transport, listPath: "lists/getbytitle('Tasks')" });

  const result = await client.getListItem(7);
  assert.deepEqual(result.data, { Id: 7, Title: "Read me" });
  assert.equal(result.etag, '"3"');
  assert.equal(transport.calls[0].path, `${listPath}(7)`);
  assert.equal(transport.calls[0].options.method, "GET");
});

test("creates an item with a JSON body", async () => {
  const transport = fakeTransport([{ data: { Id: 8, Title: "New" }, etag: '"1"', status: 201 }]);
  const client = createSharePointListClient({ transport, listPath: "lists/getbytitle('Tasks')" });
  const result = await client.createListItem({ Title: "New" });

  assert.deepEqual(result.data, { Id: 8, Title: "New" });
  assert.equal(transport.calls[0].path, listPath);
  assert.equal(transport.calls[0].options.method, "POST");
  assert.deepEqual(transport.calls[0].options.body, { Title: "New" });
});

test("updates with the exact ETag and deletes the item", async () => {
  const transport = fakeTransport([
    { data: { Id: 7, Title: "Updated" }, etag: '"4"', status: 200 },
    { data: null, status: 204 }
  ]);
  const client = createSharePointListClient({ transport, listPath: "lists/getbytitle('Tasks')" });

  await client.updateListItem(7, { Title: "Updated" }, { etag: '"3"' });
  await client.deleteListItem(7, { etag: '"4"' });

  assert.equal(transport.calls[0].path, `${listPath}(7)`);
  assert.equal(transport.calls[0].options.method, "MERGE");
  assert.equal(transport.calls[0].options.etag, '"3"');
  assert.deepEqual(transport.calls[0].options.body, { Title: "Updated" });
  assert.equal(transport.calls[1].options.method, "DELETE");
  assert.equal(transport.calls[1].options.etag, '"4"');
});

test("rejects an unsafe nextLink before calling the transport", async () => {
  const transport = fakeTransport();
  const client = createSharePointListClient({ transport, listPath: "lists/getbytitle('Tasks')" });

  await assert.rejects(
    () => client.getListItems({ nextLink: "https://evil.example/_api/web/lists/getbytitle('Tasks')/items" }),
    /nextLink|site|origin|unsafe/i
  );
  assert.equal(transport.calls.length, 0);
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
