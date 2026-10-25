import assert from "node:assert/strict";
import { createReactCompatibleHost } from "./app.js";

const records = [
  {
    Id: 1,
    Title: "Zeta",
    URL: "https://example.test/zeta",
    Categoria: "Power Platform",
    Descricao: '<p onclick="bad()">Use <strong>com segurança</strong></p><script>bad()</script>',
    IconeChave: "zeta",
    Ordem: 20,
    AbrirNovaJanela: true,
    Ativo: true
  },
  {
    Id: 2,
    Title: "Alpha",
    URL: "https://example.test/alpha",
    Categoria: "Power Platform",
    Descricao: '<a href="javascript:bad()" onmouseover="bad()">não executar</a>',
    IconeChave: "alpha",
    Ordem: 10,
    AbrirNovaJanela: false,
    Ativo: true
  },
  {
    Id: 3,
    Title: "Inactive",
    URL: "https://example.test/inactive",
    Categoria: "Power Platform",
    Descricao: "não deve aparecer",
    IconeChave: "inactive",
    Ordem: 1,
    AbrirNovaJanela: true,
    Ativo: false
  },
  {
    Id: 4,
    Title: "Other link",
    URL: "https://example.test/other",
    Categoria: "",
    Descricao: "fallback de categoria",
    IconeChave: "other",
    Ordem: 1,
    AbrirNovaJanela: true,
    Ativo: true
  }
];

const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("network access is not allowed in the React-compatible host test");
};

try {
  const host = createReactCompatibleHost({ records });

  // The host reuses the adapter contract and exposes only plain data to a view.
  assert.equal(typeof host.service.listGroupedLinks, "function");
  assert.equal(host.source.key, "recursos-links");
  assert.equal(host.source.webUrl.startsWith("/"), true);
  assert.equal(host.source.webUrl.includes("example.test"), false);
  assert.equal(typeof host.transport.request, "function");

  const loading = host.getProps();
  assert.deepEqual(loading, { loading: true, error: null, groups: [] });
  assert.deepEqual(host.getViewModel(), loading);

  const rendered = await host.load();
  assert.equal(host.transport.calls.length, 1);
  const [{ path, options }] = host.transport.calls;
  assert.equal(options.method, "GET");
  assert.equal(path.startsWith("/sites/example/_api/"), true);
  assert.equal(path.includes("http://"), false);
  assert.equal(path.includes("https://"), false);
  const query = decodeURIComponent(path.slice(path.indexOf("?") + 1));
  assert.match(query, /\$filter=Ativo eq 1/);
  assert.match(query, /\$orderby=Categoria asc,Ordem asc,Title asc/);

  // Active filtering, category fallback, and deterministic adapter ordering.
  assert.deepEqual(rendered.groups.map(({ category, heading }) => ({ category, heading })), [
    { category: "Outros", heading: "Outros" },
    { category: "Power Platform", heading: "Power Platform" }
  ]);
  assert.deepEqual(rendered.groups[1].links.map(({ id, label, href }) => ({ id, label, href })), [
    { id: 2, label: "Alpha", href: "https://example.test/alpha" },
    { id: 1, label: "Zeta", href: "https://example.test/zeta" }
  ]);
  assert.equal(rendered.groups.flatMap(({ links }) => links).some(({ label }) => label === "Inactive"), false);

  // Rich text is sanitized before it is exposed to a React-compatible view.
  const descriptions = rendered.groups.flatMap(({ links }) => links).map(({ description }) => description);
  assert.equal(descriptions.some((value) => /<\s*script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(value)), false);
  assert.match(descriptions.find((value) => value.includes("com segurança")), /com segurança/);

  assert.deepEqual(rendered.groups[1].links.map(({ target, icon }) => ({ target, icon })), [
    { target: "_self", icon: "alpha" },
    { target: "_blank", icon: "zeta" }
  ]);
  assert.deepEqual(host.getViewModel(), rendered);
  assert.doesNotThrow(() => JSON.stringify(rendered));
  assert.equal(Object.prototype.toString.call(rendered), "[object Object]");
  assert.equal("document" in globalThis, false);
  assert.equal("React" in globalThis, false);

  // A transport/data failure becomes an observable, safe error state.
  const failure = new Error("simulated transport failure");
  failure.code = "fake-failure";
  const badRecords = [{ toJSON() { throw failure; } }];
  const failingHost = createReactCompatibleHost({ records: badRecords });
  assert.deepEqual(failingHost.getProps(), { loading: true, error: null, groups: [] });
  const errorProps = await failingHost.load();
  assert.equal(failingHost.transport.calls.length, 1);
  assert.equal(errorProps.loading, false);
  assert.deepEqual(errorProps.groups, []);
  assert.deepEqual(errorProps.error, { message: "simulated transport failure", code: "fake-failure" });
  assert.doesNotThrow(() => JSON.stringify(errorProps));
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ok - React-compatible host contract, view model, states, sanitization, and fake transport");
