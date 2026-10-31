import assert from "node:assert/strict";
import { createSharePointRestClient, SharePointRestError } from "../src/index.js";
import { fakeResponse as response } from "../../sharepoint-testing/src/index.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("validates server-relative webUrl", () => {
  assert.throws(() => createSharePointRestClient({ webUrl: "https://example.test" }), TypeError);
  assert.throws(() => createSharePointRestClient({ webUrl: "//example.test" }), TypeError);
});

test("GET sends Accept and parses JSON; empty response is null", async () => {
  const calls = [];
  const client = createSharePointRestClient({ webUrl: "/sites/app", fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, ""); } });
  assert.equal((await client.request("/_api/web" )).data, null);
  assert.equal(calls[0].url, "/sites/app/_api/web");
  assert.equal(calls[0].options.headers.Accept, "application/json;odata=nometadata");
});

test("digest is cached and writes use exact If-Match", async () => {
  const calls = [];
  const client = createSharePointRestClient({ webUrl: "/sites/app", fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("contextinfo") ? response(200, JSON.stringify({ GetContextWebInformation: { FormDigestValue: "digest", FormDigestTimeoutSeconds: 600 } })) : response(204);
  } });
  await client.request("/_api/web/lists(1)", { method: "MERGE", etag: '"4"', body: { Title: "x" } });
  await client.request("/_api/web/lists(1)", { method: "DELETE", etag: '"4"' });
  assert.equal(calls.filter((call) => call.url.endsWith("contextinfo")).length, 1);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["X-HTTP-Method"], "MERGE");
  assert.equal(calls[1].options.headers["If-Match"], '"4"');
  assert.equal((await client.request("/_api/web/lists(1)", { method: "MERGE", etag: "*", body: {} }).catch((e) => e)).code, "etag-required");
});

test("only GET retries throttling and honors Retry-After", async () => {
  let count = 0; const sleeps = [];
  const client = createSharePointRestClient({ webUrl: "/sites/app", maxRetries: 1, sleepImpl: async (ms) => sleeps.push(ms), fetchImpl: async () => ++count === 1 ? response(429, "", { "Retry-After": "2" }) : response(200, "{}") });
  await client.request("/_api/web");
  assert.deepEqual(sleeps, [2000]);
  let writeCalls = 0;
  const failing = createSharePointRestClient({ webUrl: "/sites/app", fetchImpl: async (url) => {
    writeCalls += 1;
    return url.endsWith("contextinfo") ? response(200, JSON.stringify({ FormDigestValue: "d" })) : response(503, "", { "Retry-After": "1" });
  } });
  await assert.rejects(() => failing.request("/_api/web", { method: "POST", body: {} }), (error) => {
    assert.equal(error instanceof SharePointRestError, true);
    assert.equal(error.code, "throttled");
    assert.equal(error.status, 503);
    assert.equal(error.path, "/sites/app/_api/web");
    assert.equal(error.retryAfterMs, 1000);
    return true;
  });
  assert.equal(writeCalls, 2, "digest plus one non-retried write");
});

test("supports binary responses and wildcard only when explicitly enabled", async () => {
  let last;
  const client = createSharePointRestClient({ webUrl: "/sites/app", fetchImpl: async (url, options) => { last = options; return url.endsWith("contextinfo") ? response(200, JSON.stringify({ FormDigestValue: "d" })) : response(options?.headers?.["X-HTTP-Method"] ? 204 : 200, options?.headers?.["X-HTTP-Method"] ? "" : "abc"); } });
  const result = await client.request("/_api/file", { responseType: "binary" });
  assert.equal(new TextDecoder().decode(result.data), "abc");
  await client.request("/_api/file", { method: "DELETE", etag: "*", allowWildcardEtag: true });
  assert.equal(last.headers["If-Match"], "*");
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
