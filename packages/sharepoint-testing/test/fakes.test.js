import assert from "node:assert/strict";
import {
  FakeHeaders,
  fakeResponse,
  createQueueTransport,
  createListProvisioningFake
} from "../src/index.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("FakeHeaders is case-insensitive and returns null for unknown headers", () => {
  const headers = new FakeHeaders({ "Retry-After": "2", ETag: '"1"' });
  assert.equal(headers.get("retry-after"), "2");
  assert.equal(headers.get("ETAG"), '"1"');
  assert.equal(headers.get("missing"), null);
});

test("fakeResponse builds a Fetch-compatible double with text and binary bodies", async () => {
  const response = fakeResponse(200, "hello", { "Content-Type": "text/plain" });
  assert.equal(response.ok, true);
  assert.equal(await response.text(), "hello");
  assert.equal(response.headers.get("content-type"), "text/plain");

  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const binary = fakeResponse(200, "ignored", {}, bytes);
  assert.deepEqual(Array.from(new Uint8Array(await binary.arrayBuffer())), [1, 2, 3]);

  const failed = fakeResponse(503);
  assert.equal(failed.ok, false);
});

test("createQueueTransport replays queued responses and functions in order", async () => {
  const transport = createQueueTransport([
    { data: { value: [1] }, status: 200 },
    (path, options) => ({ data: { path, method: options.method }, status: 200 })
  ], { webUrl: "/sites/demo" });

  assert.equal(transport.webUrl, "/sites/demo");
  const first = await transport.request("/sites/demo/_api/web/lists");
  assert.deepEqual(first.data.value, [1]);
  const second = await transport.request("/sites/demo/_api/web/lists(1)", { method: "DELETE" });
  assert.equal(second.data.method, "DELETE");
  const empty = await transport.request("/sites/demo/_api/web");
  assert.deepEqual(empty, { data: null, status: 204, etag: null });
  assert.equal(transport.calls.length, 3);
});

test("createListProvisioningFake simulates a missing list, then create, then compatible state", async () => {
  const transport = createListProvisioningFake({ webUrl: "/sites/demo", listTitle: "Articles" });

  await assert.rejects(
    () => transport.request(`${transport.webUrl}/_api/web/lists/getbytitle('Articles')?$select=Id,Title`),
    (error) => error.code === "not-found"
  );

  const created = await transport.request(`${transport.webUrl}/_api/web/lists`, {
    method: "POST",
    body: { Title: "Articles", BaseTemplate: 100 }
  });
  assert.equal(created.data.Title, "Articles");

  const field = await transport.request(`${transport.webUrl}/_api/web/lists/getbytitle('Articles')/fields`, {
    method: "POST",
    body: { InternalName: "Status", Title: "Status", FieldTypeKind: 6, Required: true, Choices: { results: ["Draft"] } }
  });
  assert.equal(field.data.TypeAsString, "Choice");

  const list = await transport.request(`${transport.webUrl}/_api/web/lists/getbytitle('Articles')?$select=Id,Title`);
  assert.equal(list.data.Title, "Articles");
  assert.equal(transport.state.fields.length, 1);
});

test("createListProvisioningFake requires a non-empty listTitle", () => {
  assert.throws(() => createListProvisioningFake({ webUrl: "/sites/demo" }), TypeError);
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
