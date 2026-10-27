# Guia de desenvolvimento do SPMIDDLE

Este guia orienta desenvolvedores que usam o SPMIDDLE como middleware JavaScript
client-side para consulta e persistência em SharePoint REST. Ele complementa
[`API.md`](API.md), [`PROVISIONING.md`](PROVISIONING.md) e os contratos de cada
consumidor.

## 1. Visão geral e fronteiras

A arquitetura recomendada é:

```text
componentes/aplicação
        ↓
casos de uso e repositories
        ↓
mappers, schemas e queries controladas
        ↓
list client / file client
        ↓
transporte SharePoint REST
        ↓
SharePoint
```

O navegador usa a sessão e as permissões do usuário corrente. O SPMIDDLE fornece
transporte REST, digest, ETags, paginação, schemas, registry, mappers,
repositories, guardrails de segurança, arquivos e provisioning administrativo.
A aplicação fornece regras de negócio, view models, renderização, tratamento de
erros e autorização de negócio.

O SPMIDDLE não é backend, proxy de credenciais, cofre de tokens, ACL, ORM que
cria estruturas automaticamente, construtor de OData arbitrário, sincronização
offline, fila ou camada de UI. Ele não eleva permissões nem substitui as
permissões do SharePoint.

## 2. Estrutura

```text
packages/sharepoint-rest-browser/
  src/index.js          transporte e exports públicos
  src/list-client.js    listas e paginação
  src/schema.js         schemas declarativos
  src/data-sources.js   registry de fontes
  src/mapper.js         nomes de domínio e internos
  src/query.js          consultas controladas
  src/repository.js     API de domínio
  src/provisioning.js   inspect/plan/apply/verify
  src/files.js          bibliotecas e arquivos
  src/security.js       sanitização e limites
  test/                 contratos executáveis
examples/               hosts e consumidores locais
docs/                   contratos e runbooks
```

O pacote é ES module, não depende de bibliotecas de runtime e aceita `fetchImpl`
injetado nos testes.

## 3. Instalação e testes

Requer Node.js `>=20`. Na raiz do projeto:

```powershell
npm test
git diff --check
```

Os testes usam transportes simulados; não acessam tenant, não criam itens e não
substituem validação autenticada. Uma nova integração deve adicionar testes de
contrato e passar a suíte completa antes do commit.

## 4. Fluxo de integração

1. Declare schemas e fontes em código.
2. Crie um registry com sites permitidos.
3. Obtenha o list client por uma chave lógica.
4. Crie mapper e repository.
5. Aplique regras de negócio em um serviço de aplicação.
6. Entregue entidades/view models ao componente.
7. Trate erros sem expor payloads sensíveis.

Exemplo completo com placeholders:

```js
import {
  createDataSourceRegistry,
  createMapper,
  createRepository,
  defineListSchema
} from "@spmiddle/sharepoint-rest-browser";

const schema = defineListSchema({
  key: "articles",
  internalName: "AppArticles",
  displayName: "Articles",
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", type: "Text", required: true },
    { internalName: "State", type: "Choice", choices: ["Published", "Draft"] }
  ]
});

const sources = createDataSourceRegistry({
  allowedWebUrls: ["/sites/example"],
  sources: [{
    key: "articles",
    webUrl: "/sites/example",
    listPath: "lists/getbytitle('AppArticles')"
  }]
});

const mapper = createMapper({
  mapping: {
    id: { internalName: "Id", readOnly: true },
    title: { internalName: "Title", required: true },
    state: "State"
  }
});

const articles = createRepository({
  source: "articles",
  schema,
  mapper,
  client: sources.getListClient("articles")
});

const page = await articles.findMany({
  select: ["id", "title", "state"],
  filter: { field: "state", operator: "eq", value: "Published" },
  orderBy: [{ field: "title", direction: "asc" }],
  pageSize: 20
});
```

Use placeholders em exemplos públicos. Nunca versione URLs absolutas, GUIDs
reais, tokens, cookies, credenciais ou payloads corporativos.

## 5. Transporte REST

```js
import { createSharePointRestClient } from "@spmiddle/sharepoint-rest-browser";

const transport = createSharePointRestClient({
  webUrl: "/sites/example"
});
const response = await transport.request("/_api/web", { method: "GET" });
```

`webUrl` deve ser server-relative (`/sites/example` ou `/`). URLs absolutas,
hosts externos, query strings, fragments e caminhos protocol-relative são
rejeitados. Opções adicionais: `fetchImpl`, `sleepImpl`, `nowImpl` e
`maxRetries` entre 0 e 5.

O cliente aceita `GET`, `POST`, `MERGE` e `DELETE`, retornando o objeto congelado
`{ data, etag, status }`. Toda escrita obtém `X-RequestDigest`. `MERGE` e
`DELETE` exigem ETag exata e usam o padrão SharePoint `POST` com
`X-HTTP-Method` e `If-Match`.

Somente GET recebe retry automático para HTTP 429/503, respeitando
`Retry-After`. Escritas nunca são repetidas automaticamente.

```js
try {
  const result = await articles.findMany({ pageSize: 20 });
  render(result.items);
} catch (error) {
  if (error.code === "access-denied") showMessage("Acesso não permitido.");
  else if (error.code === "throttled") showMessage("Tente novamente mais tarde.");
  else showMessage("Não foi possível carregar o conteúdo.");
}
```

Use códigos estáveis (`access-denied`, `not-found`, `concurrency-conflict`,
`throttled`, `etag-required`, `invalid-response`, `network-error`) e não o texto
humano do erro para decisões.

## 6. List client e registry

O list client aceita exatamente um `listPath`, como
`lists/getbytitle('Tasks')`, ou um GUID em `listId`:

```js
import {
  createSharePointListClient,
  createSharePointRestClient
} from "@spmiddle/sharepoint-rest-browser";

const client = createSharePointListClient({
  transport: createSharePointRestClient({ webUrl: "/sites/example" }),
  listPath: "lists/getbytitle('Tasks')"
});

const page = await client.getListItems({
  select: ["Id", "Title", "Status"],
  filter: "Status eq 'Open'",
  orderBy: [{ field: "Title", direction: "asc" }],
  top: 25
});

const all = await client.getAllPages(
  { select: ["Id", "Title"], top: 100 },
  { maxPages: 10, maxItems: 1000 }
);
```

O filtro textual é API de baixo nível. Não aceite filtros, campos ou `nextLink`
diretamente da interface. Para domínio, prefira repository e query allowlisted.

O registry fecha sites e recursos permitidos:

```js
const registry = createDataSourceRegistry({
  allowedWebUrls: ["/sites/example"],
  sources: [{
    key: "tasks",
    webUrl: "/sites/example",
    listPath: "lists/getbytitle('Tasks')"
  }]
});
const tasks = registry.getListClient("tasks");
```

Uma fonte sem lista pode fornecer apenas transporte. Chaves desconhecidas não
devem virar fallback para URLs informadas pelo usuário.

## 7. Schemas

Schemas são declarações imutáveis: não fazem rede nem provisionam estruturas.
Tipos suportados incluem `Text`, `MultilineText`, `Number`, `Currency`, `Integer`,
`Boolean`, `DateTime`, `Choice`, `Lookup`, `User` e `URL`.

```js
const taskSchema = defineListSchema({
  key: "tasks",
  internalName: "AppTasks",
  displayName: "Tasks",
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", type: "Text", required: true },
    {
      internalName: "Status",
      type: "Choice",
      choices: ["Open", "Closed"],
      defaultValue: "Open"
    }
  ],
  indexes: [["Status"]]
});
```

`Choice` exige escolhas não vazias e únicas. `Lookup` exige metadados lógicos.
Nomes internos devem ser identificadores; URLs e identidade do tenant ficam fora
do schema portátil.

## 8. Mapper e repository

```js
const mapper = createMapper({
  mapping: {
    id: { internalName: "Id", readOnly: true },
    title: { internalName: "Title", required: true },
    status: "Status"
  }
});

const repository = createRepository({
  source: "tasks",
  mapper,
  client: registry.getListClient("tasks")
});

const result = await repository.findMany({
  select: ["id", "title", "status"],
  filter: { field: "status", operator: "eq", value: "Open" },
  orderBy: [{ field: "title", direction: "asc" }],
  pageSize: 20
});
```

O mapper rejeita campos desconhecidos, read-only e obrigatórios ausentes. O
repository expõe `findById`, `findMany`, `count`, `create`, `update` e `delete`.
Operadores controlados: `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `contains` e
`beginsWith`.

Para escrever, preserve a ETag:

```js
const current = await repository.findById(7);
await repository.update(7, { title: "Novo título" }, { etag: current.etag });
```

HTTP 412 é conflito: leia novamente e decida mesclar, reaplicar ou cancelar.
Wildcard não é padrão e só pode ser explicitamente autorizado em operação
administrativa documentada.

## 9. Arquivos e segurança

```js
const files = createSharePointFileClient({
  transport,
  libraryPath: "/sites/example/Shared Documents",
  maxSize: 10 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf"],
  allowedExtensions: [".pdf"]
});

await files.uploadFile({
  folderPath: "articles",
  fileName: "manual.pdf",
  content: arrayBuffer,
  contentType: "application/pdf",
  overwrite: false
});
```

São rejeitados traversal, caminhos absolutos, URLs, data URLs, Base64 aparente,
limites excedidos e tipos/extensões fora da allowlist. Uploads não recebem retry.

```js
const safeHtml = sanitizeRichText(untrustedHtml);
const safeLink = validateSafeUrl(link, { allowRelative: true });
const validSize = validateContentLimits(text, { maxTextLength: 4000, maxBytes: 12000 });
```

Esses guardrails não substituem CSP, Trusted Types ou sanitização no servidor.
Escape texto no ponto de renderização e não use `innerHTML` com conteúdo não
confiável.

## 10. Provisioning administrativo

O runtime nunca deve provisionar. O fluxo obrigatório é:

```text
inspect → plan → confirmação explícita → apply → verify
```

```js
const inspection = await provisioning.inspect({ source: "tasks", schema: taskSchema });
const plan = provisioning.plan(inspection, { schema: taskSchema });
// Exibir operações, riscos e fingerprint ao administrador.
const applied = await provisioning.apply(plan, { confirmation: plan.fingerprint });
const verified = await provisioning.verify({ source: "tasks", schema: taskSchema, expected: applied });
```

Confirme o fingerprint exato, valide o destino imediatamente antes do apply, use
ETags, preserve dados e trate renomes, remoções, mudanças de tipo e índices
únicos como alto risco. Não repita cegamente uma escrita ambígua. Provisioning
não é transacional; rollback é uma migração compensatória documentada seguida de
nova inspeção e verificação.

## 11. Casos de uso

### Serviço read-only

```js
export function createPublishedService({ repository, clock = () => new Date() }) {
  return Object.freeze({
    async listLatest({ category, limit = 5 } = {}) {
      const filter = [
        { field: "state", operator: "eq", value: "Published" },
        { field: "publishedAt", operator: "le", value: clock().toISOString() }
      ];
      if (category) filter.push({ field: "category", operator: "eq", value: category });
      const result = await repository.findMany({
        select: ["id", "title", "category", "publishedAt"],
        filter,
        orderBy: [{ field: "publishedAt", direction: "desc" }],
        pageSize: Math.min(Math.max(limit, 1), 50)
      }, { maxItems: 50 });
      return result.items;
    }
  });
}
```

O componente recebe o serviço por injeção e não conhece SharePoint.

### Fake adapter

Use um cliente fake para testar campos, filtros, limites, ETags e ausência de
escritas:

```js
const fakeClient = {
  async getListItems() {
    return { data: { value: [{ Id: 1, Title: "Example", State: "Published" }] }, etag: '"1"' };
  },
  async getListItem() {},
  async createListItem(values) {},
  async updateListItem(id, values, options) {},
  async deleteListItem(id, options) {}
};
```

O fake deve registrar chamadas e permitir verificar allowlist, paginação e ETags
sem rede.

## 12. Hosts e MINIJOOMLA

Um host deve montar sua raiz uma vez, atualizar somente regiões internas, ignorar
respostas obsoletas e evitar `location.reload()` para ações internas. Consulte
[`INCREMENTAL-HOST-UPDATES.md`](INCREMENTAL-HOST-UPDATES.md) e
`examples/incremental-mse-host/`.

MINIJOOMLA deve consumir SPMIDDLE por adapters de domínio:

```text
MINIJOOMLA componente → serviço de aplicação → adapter → SPMIDDLE repository
```

Templates, módulos, plugins e view models não devem conhecer `webUrl`, `listPath`,
ETag, `/_api/` ou nomes internos. O adapter deve ser substituível por fixtures.
Não reutilize módulos específicos de CAMAP-AGP, TD, Fórum, Videoteca ou Explorar
Mais em um consumidor genérico.

## 13. Testes e checklist

Teste schema, registry, allowlist de campos, filtros, paginação, ordenação,
mapper, obrigatórios, read-only, sanitização, limites, acesso negado, not-found,
throttling, conflito, ETag e ausência de writes em fluxo read-only.

Antes de aprovar uma integração:

- [ ] contrato de domínio documentado;
- [ ] fonte identificada por chave e allowlist;
- [ ] nenhum segredo ou URL absoluta versionado;
- [ ] schema não faz rede;
- [ ] queries usam operadores allowlisted;
- [ ] UI não acessa REST diretamente;
- [ ] writes exigem ETag;
- [ ] paginação possui limites;
- [ ] conteúdo é escapado/sanitizado;
- [ ] provisioning está fora do bootstrap;
- [ ] rollback documentado;
- [ ] fake transport cobre o caso;
- [ ] `npm test` e `git diff --check` passam.

Para tenant, use somente FIORI-AUTO e o fluxo inspect/plan/confirm/apply/verify.
Não use navegador genérico, Selenium, Playwright direto ou CDP avulso.

## 14. Referências

- [`API.md`](API.md) — API detalhada;
- [`PROVISIONING.md`](PROVISIONING.md) — provisioning;
- [`INCREMENTAL-HOST-UPDATES.md`](INCREMENTAL-HOST-UPDATES.md) — hosts sem reload;
- [`HOST-COMPATIBILITY.md`](HOST-COMPATIBILITY.md) — hosts compatíveis;
- [`INTEGRATION-MSE-PLATFORM.md`](INTEGRATION-MSE-PLATFORM.md) — integração futura;
- [`SECURITY.md`](../SECURITY.md) — limites de segurança;
- `packages/sharepoint-rest-browser/test/` — contratos executáveis.
