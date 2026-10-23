import assert from "node:assert/strict";

/**
 * Small Fetch-compatible test doubles. They are exported so adapter tests can
 * reuse the contract without bringing in a test or HTTP dependency.
 */
export class FakeHeaders {
  constructor(values = {}) {
    this.values = new Map(
      Object.entries(values).map(([name, value]) => [name.toLowerCase(), String(value)])
    );
  }

  get(name) {
    return this.values.get(String(name).toLowerCase()) ?? null;
  }
}

export function fakeResponse(status, body = "", headers = {}, binaryBody) {
  const bytes = binaryBody ?? new TextEncoder().encode(body).buffer;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new FakeHeaders(headers),
    text: async () => body,
    arrayBuffer: async () => bytes
  };
}

function test(name, fn) {
  return { name, fn };
}

/**
 * Run the stable first-increment SharePoint REST transport contract.
 *
 * `factory` receives the same options as the production factory and must
 * return a client with `request(path, options)` and `webUrl`.
 */
export async function runSharePointRestContract(factory, { report = () => {} } = {}) {
  assert.equal(typeof factory, "function", "a client factory is required");

  const tests = [
    test("accepts only a server-relative webUrl", () => {
      const fetchImpl = async () => fakeResponse(200);
      assert.throws(() => factory({ webUrl: "https://example.test", fetchImpl }), TypeError);
      assert.throws(() => factory({ webUrl: "//example.test", fetchImpl }), TypeError);
      assert.equal(factory({ webUrl: "/sites/app/", fetchImpl }).webUrl, "/sites/app");
    }),

    test("GET sends the default Accept header and maps an empty response to null", async () => {
      const calls = [];
      const client = factory({
        webUrl: "/sites/app",
        fetchImpl: async (url, options) => {
          calls.push({ url, options });
          return fakeResponse(200);
        }
      });

      assert.equal((await client.request("/_api/web")).data, null);
      assert.equal(calls[0].url, "/sites/app/_api/web");
      assert.equal(calls[0].options.method, "GET");
      assert.equal(calls[0].options.headers.Accept, "application/json;odata=nometadata");
    }),

    test("caches the digest and sends MERGE/DELETE as POST overrides with exact ETag", async () => {
      const calls = [];
      const client = factory({
        webUrl: "/sites/app",
        fetchImpl: async (url, options) => {
          calls.push({ url, options });
          if (url.endsWith("contextinfo")) {
            return fakeResponse(200, JSON.stringify({
              GetContextWebInformation: { FormDigestValue: "digest", FormDigestTimeoutSeconds: 600 }
            }));
          }
          return fakeResponse(204);
        }
      });

      await client.request("/_api/web/lists(1)", { method: "MERGE", etag: '"4"', body: { Title: "x" } });
      await client.request("/_api/web/lists(1)", { method: "DELETE", etag: '"4"' });

      assert.equal(calls.filter(({ url }) => url.endsWith("contextinfo")).length, 1);
      assert.equal(calls[1].options.method, "POST");
      assert.equal(calls[1].options.headers["X-RequestDigest"], "digest");
      assert.equal(calls[1].options.headers["X-HTTP-Method"], "MERGE");
      assert.equal(calls[1].options.headers["If-Match"], '"4"');
      assert.equal(calls[2].options.headers["X-HTTP-Method"], "DELETE");
      assert.equal(calls[2].options.headers["If-Match"], '"4"');
      await assert.rejects(
        () => client.request("/_api/web/lists(1)", { method: "MERGE", etag: "*", body: {} }),
        (error) => error?.code === "etag-required"
      );
    }),

    test("retries throttled GETs using Retry-After", async () => {
      let attempts = 0;
      const sleeps = [];
      const client = factory({
        webUrl: "/sites/app",
        maxRetries: 1,
        sleepImpl: async (ms) => sleeps.push(ms),
        fetchImpl: async () => ++attempts === 1
          ? fakeResponse(429, "", { "Retry-After": "2" })
          : fakeResponse(200, "{}")
      });

      assert.deepEqual((await client.request("/_api/web")).data, {});
      assert.equal(attempts, 2);
      assert.deepEqual(sleeps, [2000]);
    }),

    test("does not retry writes and exposes typed throttling errors", async () => {
      let resourceCalls = 0;
      const client = factory({
        webUrl: "/sites/app",
        fetchImpl: async (url) => {
          if (url.endsWith("contextinfo")) {
            return fakeResponse(200, JSON.stringify({ FormDigestValue: "digest" }));
          }
          resourceCalls += 1;
          return fakeResponse(503, "", { "Retry-After": "1" });
        }
      });

      await assert.rejects(
        () => client.request("/_api/web", { method: "POST", body: {} }),
        (error) => error?.name === "SharePointRestError"
          && error.code === "throttled"
          && error.status === 503
          && error.path === "/sites/app/_api/web"
          && error.retryAfterMs === 1000
      );
      assert.equal(resourceCalls, 1);
    }),

    test("returns binary responses", async () => {
      const bytes = new Uint8Array([0, 1, 255]).buffer;
      const client = factory({
        webUrl: "/sites/app",
        fetchImpl: async () => fakeResponse(200, "ignored", {}, bytes)
      });
      assert.deepEqual(Array.from(new Uint8Array((await client.request("/_api/file", { responseType: "binary" })).data)), [0, 1, 255]);
    }),

    test("allows wildcard ETag only with explicit opt-in", async () => {
      let lastOptions;
      const client = factory({
        webUrl: "/sites/app",
        fetchImpl: async (url, options) => {
          lastOptions = options;
          return url.endsWith("contextinfo")
            ? fakeResponse(200, JSON.stringify({ FormDigestValue: "digest" }))
            : fakeResponse(204);
        }
      });

      await assert.rejects(
        () => client.request("/_api/file", { method: "DELETE", etag: "*" }),
        (error) => error?.code === "etag-required"
      );
      await client.request("/_api/file", { method: "DELETE", etag: "*", allowWildcardEtag: true });
      assert.equal(lastOptions.headers["If-Match"], "*");
    })
  ];

  for (const { name, fn } of tests) {
    await fn();
    report(name);
  }
  return tests.length;
}
