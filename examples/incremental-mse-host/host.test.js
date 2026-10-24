import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createIncrementalMseHost } from "./app.js";

const placeholderItems = [
  { id: "<item-a>", title: "<title-a>", category: "<category>", value: "<value-a>" },
  { id: "<item-b>", title: "<title-b>", category: "<category>", value: "<value-b>" }
];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeTransport() {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    request(action, payload) {
      const wait = deferred();
      calls.push({ action, payload });
      pending.push({ action, payload, ...wait });
      return wait.promise;
    }
  };
}

const transport = fakeTransport();
const fallbacks = [];
const host = createIncrementalMseHost({
  transport,
  initialState: {
    items: placeholderItems,
    query: "",
    filter: "<category>",
    layout: "<layout>"
  },
  onFallback: (request) => fallbacks.push(request)
});

// The root is a stable host concern, not a render operation. Repeated mount
// requests must not create a second root or remount unaffected regions.
assert.equal(host.mount(), host.mount());
assert.equal(host.metrics().rootMounts, 1);
assert.equal(host.metrics().fullNavigations, 0);
assert.deepEqual(host.regions(), ["root", "query", "items", "layout"]);

// Internal query, filter, update, and layout actions stay inside the host.
const query = host.dispatch({ type: "query", value: "<query>" });
assert.equal(transport.calls.at(-1).action, "query");
assert.equal(transport.calls.at(-1).payload.value, "<query>");
assert.equal(host.metrics().fullNavigations, 0);
assert.deepEqual(host.getState().query, "<query>");
transport.pending.at(-1).resolve({ items: [{ ...placeholderItems[0], value: "<query-result>" }] });
await query;

const filter = host.dispatch({ type: "filter", value: "<filtered-category>" });
assert.equal(transport.calls.at(-1).action, "filter");
assert.equal(host.metrics().fullNavigations, 0);
transport.pending.at(-1).resolve({ items: [{ ...placeholderItems[1], category: "<filtered-category>" }] });
await filter;

const update = host.dispatch({
  type: "update",
  item: { id: "<item-a>", value: "<updated-value>" }
});
assert.equal(transport.calls.at(-1).action, "update");
assert.deepEqual(transport.calls.at(-1).payload.item, { id: "<item-a>", value: "<updated-value>" });
transport.pending.at(-1).resolve({ item: { ...placeholderItems[0], value: "<updated-value>" } });
await update;

const layout = host.dispatch({ type: "layout", value: "<compact-layout>" });
assert.equal(transport.calls.at(-1).action, "layout");
assert.equal(host.getState().layout, "<compact-layout>");
transport.pending.at(-1).resolve({ ok: true });
await layout;
assert.equal(host.metrics().fullNavigations, 0);
assert.deepEqual(host.metrics().affectedRegions, ["items", "items", "items", "layout"]);

// An older asynchronous query cannot overwrite the result of a newer query.
const first = host.dispatch({ type: "query", value: "<old-query>" });
const second = host.dispatch({ type: "query", value: "<new-query>" });
const oldRequest = transport.pending.at(-2);
const newRequest = transport.pending.at(-1);
newRequest.resolve({ items: [{ id: "<new-item>", title: "<new-title>" }] });
await second;
oldRequest.resolve({ items: [{ id: "<old-item>", title: "<old-title>" }] });
await first;
assert.equal(host.getState().query, "<new-query>");
assert.deepEqual(host.getState().items, [{ id: "<new-item>", title: "<new-title>" }]);
assert.equal(host.metrics().staleResponsesIgnored, 1);

// External/context navigation is not disguised as an internal update: it uses
// the explicit fallback and is the only path allowed to count as navigation.
await host.navigate("<external-context>", { kind: "external" });
assert.deepEqual(fallbacks, [{ url: "<external-context>", kind: "external" }]);
assert.equal(host.metrics().fullNavigations, 0);
assert.equal(host.metrics().fallbacks, 1);

// State and placeholders are plain, serializable data only.
assert.doesNotThrow(() => JSON.stringify(host.getState()));
assert.doesNotThrow(() => JSON.stringify(host.metrics()));
assert.equal(JSON.stringify(host.getState()).includes("undefined"), false);
assert.match(JSON.stringify(host.getState()), /<new-query>|<new-item>/);

// This host contract must not acquire browser or network side effects. The
// source check catches accidental use even when Node has no DOM globals.
const appText = await readFile(new URL("./app.js", import.meta.url), "utf8");
assert.doesNotMatch(appText, /\b(document|window|location|fetch|XMLHttpRequest|WebSocket)\b/);
assert.doesNotMatch(appText, /\.reload\s*\(/);
assert.doesNotMatch(appText, /https?:\/\/(?!<placeholder-host>)/);
assert.equal("document" in globalThis, false);
assert.equal("window" in globalThis, false);
assert.equal("location" in globalThis, false);

console.log("ok - incremental MSE host preserves root, updates affected regions, ignores stale responses, and avoids navigation/DOM/network APIs");
