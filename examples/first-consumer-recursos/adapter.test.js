import assert from "node:assert/strict";
import {
  createRecursosCompatibilityService,
  mapper,
  schema
} from "./adapter.js";

const source = {
  key: "recursos-links",
  webUrl: "/sites/example",
  listPath: "lists/getbytitle('RecursosLinks')"
};

const records = [
  {
    Id: 1,
    Title: "Zeta",
    URL: "https://example.test/zeta",
    Categoria: "Power Platform",
    Descricao: '<p onclick="steal()">Use <strong>com segurança</strong></p><script>alert(1)</script>',
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
    Descricao: "<a href=\"javascript:alert(1)\">não executar</a>",
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
    Title: "Sem categoria",
    URL: "https://example.test/other",
    Descricao: "fallback de categoria",
    IconeChave: "other",
    Ordem: 1,
    AbrirNovaJanela: true,
    Ativo: true
  }
];

function fakeTransport() {
  const calls = [];
  return {
    webUrl: source.webUrl,
    calls,
    async request(path, options = {}) {
      calls.push({ path, options });
      assert.equal(options.method, "GET");
      assert.match(path, /\/items\?/);

      const query = decodeURIComponent(path.slice(path.indexOf("?") + 1));
      assert.match(query, /\$select=Id,Title,URL,Categoria,Descricao,IconeChave,Ordem,AbrirNovaJanela,Ativo/);
      assert.match(query, /\$filter=Ativo eq true/);
      assert.match(query, /\$orderby=Categoria asc,Ordem asc,Title asc/);
      assert.match(query, /\$top=500/);

      // Simulate SharePoint applying the controlled filter and ordering.  The
      // adapter must express these constraints in the request, not filter only
      // after receiving an unrestricted result.
      const active = records
        .filter((item) => item.Ativo === true)
        .sort((left, right) =>
          String(left.Categoria ?? "").localeCompare(String(right.Categoria ?? ""))
          || (left.Ordem ?? 0) - (right.Ordem ?? 0)
          || left.Title.localeCompare(right.Title));
      return { status: 200, etag: null, data: { value: active } };
    }
  };
}

// Schema and mapper preserve the legacy physical names and required fields.
assert.equal(schema.key, "recursos-links");
assert.equal(schema.internalName, "RecursosLinks");
assert.equal(schema.schemaVersion, 3);
assert.deepEqual(
  schema.fields.map(({ internalName }) => internalName),
  ["URL", "Categoria", "Descricao", "IconeChave", "Ordem", "AbrirNovaJanela", "Ativo"]
);
assert.equal(mapper.toInternal("Title"), "Title");
assert.equal(mapper.toInternal("Ativo"), "Ativo");
assert.deepEqual(mapper.mapItem(records[0]), {
  Id: 1,
  Title: "Zeta",
  URL: "https://example.test/zeta",
  Categoria: "Power Platform",
  Descricao: records[0].Descricao,
  IconeChave: "zeta",
  Ordem: 20,
  AbrirNovaJanela: true,
  Ativo: true
});
assert.deepEqual(mapper.mapCreate({
  Title: "Novo",
  URL: "https://example.test/new",
  Categoria: "Cat",
  Ativo: true
}), {
  Title: "Novo",
  URL: "https://example.test/new",
  Categoria: "Cat",
  Ativo: true
});
assert.throws(() => mapper.mapCreate({
  Title: "Inválido",
  URL: "https://example.test/new",
  Categoria: "Cat",
  Ativo: true,
  Id: 99
}), /somente leitura|read.?only/i);

const transport = fakeTransport();
const service = createRecursosCompatibilityService({ source, client: transport });
const grouped = await service.listGroupedLinks();

// Legacy grouped shape, active-only results, deterministic ordering, and the
// historical "Outros" category fallback are all part of the compatibility API.
assert.deepEqual(grouped.map(({ category }) => category), ["Outros", "Power Platform"]);
assert.deepEqual(grouped[1].links.map(({ Title, Ordem }) => ({ Title, Ordem })), [
  { Title: "Alpha", Ordem: 10 },
  { Title: "Zeta", Ordem: 20 }
]);
assert.equal(grouped[0].links[0].Title, "Sem categoria");
assert.equal(grouped.flatMap(({ links }) => links).some(({ Title }) => Title === "Inactive"), false);

const sanitized = grouped[1].links[0].Descricao;
assert.equal(/<\s*script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(sanitized), false);
assert.match(grouped[1].links[1].Descricao, /com segurança/);
assert.equal(transport.calls.length, 1);

// Source and entry URL validation reject unsafe values before exposing them.
assert.throws(() => createRecursosCompatibilityService({
  source: { ...source, webUrl: "https://evil.test" },
  client: transport
}), /server-relative|URL|webUrl/i);
assert.throws(() => createRecursosCompatibilityService({
  source: { ...source, listPath: "lists/../Secrets" },
  client: transport
}), /caminho REST|listPath|seguro/i);

const unsafeTransport = {
  webUrl: source.webUrl,
  async request() {
    return {
      status: 200,
      data: { value: [{ ...records[0], URL: "javascript:alert(1)" }] }
    };
  }
};
await assert.rejects(
  () => createRecursosCompatibilityService({ source, client: unsafeTransport }).listGroupedLinks(),
  /URL externa não permitida|URL/i
);

assert.throws(() => createRecursosCompatibilityService({ source }), /client|transportFactory|injetar/i);
assert.throws(() => createRecursosCompatibilityService({
  source,
  client: transport,
  transportFactory: () => transport
}), /client ou transportFactory/i);

console.log("ok - Recursos adapter schema, controlled query, legacy grouping, URL safety, sanitization, and invalid-entry rejection");
