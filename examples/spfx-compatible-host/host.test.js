import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSpfxCompatibleHost } from "./app.js";

const source = {
  key: "recursos-links",
  webUrl: "/sites/<site-name>",
  listPath: "lists/getbytitle('<list-title>')"
};

const records = [
  {
    Id: "<zeta-id>",
    Title: "<zeta-title>",
    URL: "https://<placeholder-host>/zeta",
    Categoria: "<category>",
    Descricao: '<p onclick="bad()">Use <strong>placeholder</strong></p><script>bad()</script>',
    IconeChave: "<zeta-icon>",
    Ordem: 20,
    AbrirNovaJanela: true,
    Ativo: true
  },
  {
    Id: "<alpha-id>",
    Title: "<alpha-title>",
    URL: "https://<placeholder-host>/alpha",
    Categoria: "<category>",
    Descricao: '<a href="javascript:bad()" onmouseover="bad()">placeholder</a>',
    IconeChave: "<alpha-icon>",
    Ordem: 10,
    AbrirNovaJanela: false,
    Ativo: true
  },
  {
    Id: "<inactive-id>",
    Title: "<inactive-title>",
    URL: "https://<placeholder-host>/inactive",
    Categoria: "<category>",
    Descricao: "placeholder hidden",
    IconeChave: "<inactive-icon>",
    Ordem: 1,
    AbrirNovaJanela: true,
    Ativo: false
  },
  {
    Id: "<other-id>",
    Title: "<other-title>",
    URL: "https://<placeholder-host>/other",
    Categoria: "",
    Descricao: "placeholder fallback",
    IconeChave: "<other-icon>",
    Ordem: 1,
    AbrirNovaJanela: true,
    Ativo: true
  }
];

function fakeTransport(items) {
  const calls = [];
  return {
    webUrl: source.webUrl,
    calls,
    async request(path, options = {}) {
      calls.push({ path, options: { ...options } });
      return { status: 200, etag: null, data: { value: JSON.parse(JSON.stringify(items)) } };
    }
  };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("network access is not allowed in the SPFx-compatible host test");
};

try {
  // SPFx-like context/configuration is plain data and is validated before use.
  const context = {
    pageContext: { web: { absoluteUrl: "https://<placeholder-host>/sites/<site-name>" } },
    sdks: {}
  };
  const transport = fakeTransport(records);
  const host = createSpfxCompatibleHost({ context, source, transport });

  assert.equal(typeof host.service.listGroupedLinks, "function");
  assert.equal(host.source.key, "recursos-links");
  assert.equal(host.source.webUrl, "/sites/<site-name>");
  assert.equal(typeof host.transport.request, "function");
  assert.deepEqual(host.getRenderState(), { status: "loading", groups: [], error: null });
  assert.equal("document" in globalThis, false);
  assert.equal("window" in globalThis, false);
  assert.equal("React" in globalThis, false);

  const rendered = await host.load();
  assert.deepEqual(host.getRenderState(), rendered);
  assert.equal(rendered.status, "ready");
  assert.equal(transport.calls.length, 1);
  const [{ path, options }] = transport.calls;
  assert.equal(options.method, "GET");
  const query = decodeURIComponent(path.slice(path.indexOf("?") + 1));
  assert.match(query, /\$filter=Ativo eq true/);
  assert.match(query, /\$orderby=Categoria asc,Ordem asc,Title asc/);

  // The host keeps the adapter contract: active-only, fallback category, order,
  // and safe presentation values are supplied by the shared compatibility layer.
  assert.deepEqual(rendered.groups.map(({ category, heading }) => ({ category, heading })), [
    { category: "<category>", heading: "<category>" },
    { category: "Outros", heading: "Outros" }
  ]);
  assert.deepEqual(rendered.groups[0].links.map(({ id, label, href }) => ({ id, label, href })), [
    { id: "<alpha-id>", label: "<alpha-title>", href: "https://<placeholder-host>/alpha" },
    { id: "<zeta-id>", label: "<zeta-title>", href: "https://<placeholder-host>/zeta" }
  ]);
  assert.equal(rendered.groups.flatMap(({ links }) => links).some(({ label }) => label === "<inactive-title>"), false);
  const descriptions = rendered.groups.flatMap(({ links }) => links).map(({ description }) => description);
  assert.equal(descriptions.some((value) => /<\s*script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(value)), false);
  assert.deepEqual(rendered.groups[0].links.map(({ target, icon }) => ({ target, icon })), [
    { target: "_self", icon: "<alpha-icon>" },
    { target: "_blank", icon: "<zeta-icon>" }
  ]);
  assert.doesNotThrow(() => JSON.stringify(rendered));

  // SPFx property updates replace configuration and reset the observable state.
  const updatedRecords = [{
    Id: "<updated-id>", Title: "<updated-title>", URL: "https://<placeholder-host>/updated",
    Categoria: "<updated-category>", Descricao: "<updated-description>",
    IconeChave: "<updated-icon>", Ordem: 1, AbrirNovaJanela: false, Ativo: true
  }];
  host.updateProperties({ records: updatedRecords });
  assert.deepEqual(host.getRenderState(), { status: "loading", groups: [], error: null });
  const updated = await host.load();
  assert.equal(updated.status, "ready");
  assert.equal(updated.groups[0].links[0].label, "<updated-title>");

  // Invalid SPFx-like configuration is rejected without DOM/network access.
  assert.throws(() => createSpfxCompatibleHost({ source, transport }), /context/i);
  assert.throws(() => createSpfxCompatibleHost({ context, transport }), /source/i);
  assert.throws(() => createSpfxCompatibleHost({ context, source }), /transport|client/i);
  assert.throws(() => createSpfxCompatibleHost({
    context, source: { ...source, webUrl: "https://<placeholder-host>" }, transport
  }), /server-relative|webUrl|URL/i);

  const emptyHost = createSpfxCompatibleHost({ context, source, transport: fakeTransport([]) });
  assert.deepEqual(await emptyHost.load(), { status: "empty", groups: [], error: null });

  // Placeholder-only source and data remain free of tenant identifiers and SDK imports.
  const appText = await readFile(new URL("./app.js", import.meta.url), "utf8");
  assert.doesNotMatch(appText, /@microsoft\//);
  assert.doesNotMatch(appText, /https?:\/\/(?!<placeholder-host>)/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ok - SPFx-compatible host contract, validation, state, updates, sanitization, and fake transport");
