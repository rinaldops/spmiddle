import assert from "node:assert/strict";
import { createRecursosCompatibilityService } from "./adapter.js";

const source = {
  key: "recursos-links",
  webUrl: "/sites/<site-name>",
  listPath: "lists/getbytitle('<list-title>')"
};

const records = [
  { Id: "<zeta-id>", Title: "<zeta-title>", URL: "https://<placeholder-host>/zeta", Categoria: "<category>", Descricao: "<zeta-description>", IconeChave: "<zeta-icon>", Ordem: 20, AbrirNovaJanela: true, Ativo: 1 },
  { Id: "<alpha-id>", Title: "<alpha-title>", URL: "https://<placeholder-host>/alpha", Categoria: "<category>", Descricao: "<alpha-description>", IconeChave: "<alpha-icon>", Ordem: 10, AbrirNovaJanela: false, Ativo: true },
  { Id: "<inactive-id>", Title: "<inactive-title>", URL: "https://<placeholder-host>/inactive", Categoria: "<category>", Descricao: "<inactive-description>", IconeChave: "<inactive-icon>", Ordem: 1, AbrirNovaJanela: false, Ativo: 0 },
  { Id: "<other-id>", Title: "<other-title>", URL: "https://<placeholder-host>/other", Categoria: "", Descricao: "<other-description>", IconeChave: "<other-icon>", Ordem: 1, AbrirNovaJanela: true, Ativo: true }
];

// Sanitized behavioral oracle based on mod_recursos/recursos-data.js. It is not
// imported from mse-platform so this test cannot silently couple the projects.
function legacyProjection(items) {
  const active = items
    .filter((item) => item.Ativo === true || item.Ativo === 1)
    .map((item) => ({ ...item, category: item.Categoria || "Outros" }))
    .sort((left, right) =>
      String(left.category).localeCompare(String(right.category), "pt-BR")
      || Number(left.Ordem || 0) - Number(right.Ordem || 0)
      || String(left.Title || "").localeCompare(String(right.Title || ""), "pt-BR")
    );
  const groups = new Map();
  for (const item of active) {
    const category = item.category;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({
      id: item.Id,
      label: item.Title,
      href: item.URL,
      target: item.AbrirNovaJanela ? "_blank" : "_self"
    });
  }
  return [...groups].map(([category, links]) => ({ category, links }));
}

function fakeTransport(calls) {
  return {
    webUrl: source.webUrl,
    async request(path, options = {}) {
      calls.push({ path, options });
      const query = decodeURIComponent(path.slice(path.indexOf("?") + 1));
      assert.match(query, /\$filter=Ativo eq true/);
      assert.match(query, /\$orderby=Categoria asc,Ordem asc,Title asc/);
      assert.match(query, /\$top=500/);
      return { status: 200, etag: null, data: { value: JSON.parse(JSON.stringify(records)) } };
    }
  };
}

const calls = [];
const service = createRecursosCompatibilityService({
  source,
  client: fakeTransport(calls)
});
const actual = (await service.listGroupedLinks()).map(({ category, links }) => ({
  category,
  links: links.map(({ Id, Title, URL, AbrirNovaJanela }) => ({
    id: Id,
    label: Title,
    href: URL,
    target: AbrirNovaJanela ? "_blank" : "_self"
  }))
}));

assert.deepEqual(actual, legacyProjection(records));
assert.deepEqual(actual.map(({ category }) => category), ["<category>", "Outros"]);
assert.equal(actual[0].links[0].id, "<alpha-id>");
assert.equal(actual[0].links[1].id, "<zeta-id>");
assert.equal(actual.flatMap(({ links }) => links).some(({ id }) => id === "<inactive-id>"), false);
assert.equal(calls.length, 1);

console.log("ok - Explore Mais local parity: legacy projection, controlled query, filtering, ordering, and grouping");
