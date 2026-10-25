import assert from "node:assert/strict";
import { createStandaloneHost } from "./app.js";

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
  throw new Error("network access is not allowed in the standalone host test");
};

try {
  const host = createStandaloneHost({ records });

  // The host must consume the existing Explore Mais compatibility service,
  // rather than reimplementing its list query or grouping contract.
  assert.equal(typeof host.service.listGroupedLinks, "function");
  assert.equal(host.source.key, "recursos-links");

  const model = await host.render();

  // The injected transport proves the service was actually consumed and that
  // the compatibility query retains server-side active filtering and ordering.
  assert.equal(host.transport.calls.length, 1);
  const [{ path, options }] = host.transport.calls;
  assert.equal(options.method, "GET");
  const query = decodeURIComponent(path.slice(path.indexOf("?") + 1));
  assert.match(query, /\$filter=Ativo eq 1/);
  assert.match(query, /\$orderby=Categoria asc,Ordem asc,Title asc/);

  // Grouping, active-only filtering, and deterministic ordering come from the
  // compatibility service and remain visible in the render model.
  assert.deepEqual(model.map(({ heading }) => heading), ["Outros", "Power Platform"]);
  assert.deepEqual(model[1].links.map(({ label, href }) => ({ label, href })), [
    { label: "Alpha", href: "https://example.test/alpha" },
    { label: "Zeta", href: "https://example.test/zeta" }
  ]);
  assert.equal(model[0].links[0].label, "Other link");
  assert.equal(model.flatMap(({ links }) => links).some(({ label }) => label === "Inactive"), false);

  // Rich text is sanitized before it reaches the host's render model.
  const descriptions = model.flatMap(({ links }) => links).map(({ description }) => description);
  assert.equal(descriptions.some((value) => /<\s*script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(value)), false);
  assert.match(descriptions.find((value) => value.includes("com segurança")), /com segurança/);

  // The host exposes a plain, serializable render model and does not perform
  // network I/O; the injected in-memory transport is the only request source.
  assert.deepEqual(model[1].links.map(({ target, icon }) => ({ target, icon })), [
    { target: "_self", icon: "alpha" },
    { target: "_blank", icon: "zeta" }
  ]);
  assert.doesNotThrow(() => JSON.stringify(model));
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ok - standalone host consumes Explore Mais compatibility service without network");
