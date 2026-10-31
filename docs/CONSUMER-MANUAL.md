# Manual do consumidor do SPMIDDLE

Este manual é o ponto de entrada para aplicações que consumirão o SPMIDDLE.
Ele descreve o modelo de execução, os pacotes públicos, os contratos de entrada
e saída, limites, erros, segurança, provisionamento e testes.

O comportamento documentado é o comportamento implementado no baseline atual.
Para referências específicas, consulte também:

- [`API.md`](API.md): transporte REST e cliente de listas;
- [`SCHEMA-CONTRACT.md`](SCHEMA-CONTRACT.md): schemas;
- [`QUERY-CONTRACT.md`](QUERY-CONTRACT.md): consultas controladas;
- [`PROVISIONING.md`](PROVISIONING.md): provisionamento administrativo;
- [`ERROR-CATALOG.md`](ERROR-CATALOG.md): códigos de erro;
- [`LIMITS.md`](LIMITS.md): limites e defaults;
- [`SECURITY.md`](../SECURITY.md): política de segurança;
- [`ARCHITECTURE.md`](ARCHITECTURE.md): responsabilidades dos pacotes.

Todos os exemplos usam placeholders e caminhos server-relative. Não coloque
tenant, GUID, credencial, token, cookie ou dado corporativo neste manual.

## 1. Modelo do produto

O SPMIDDLE é middleware JavaScript client-side para SharePoint REST:

```text
Aplicação frontend
        ↓
Schemas, mappers, repositories e clientes especializados
        ↓
Cliente REST do SPMIDDLE
        ↓
SharePoint REST API
```

Ele não é backend, proxy, cofre de segredos, ORM genérico, mecanismo de
autorização independente, sincronizador offline ou executor em background.
As chamadas usam a sessão e as permissões do usuário atual no SharePoint.

## 2. Pacotes e exportações

| Pacote | Responsabilidade | Exportações |
|---|---|---|
| `@spmiddle/sharepoint-rest-browser` | REST, itens e registro de fontes | `createSharePointRestClient`, `createSharePointListClient`, `createDataSourceRegistry`, `SharePointRestError` |
| `@spmiddle/sharepoint-schema` | Schemas imutáveis | `defineListSchema`, `validateListSchema` |
| `@spmiddle/data-core` | Mapper, queries e repository | `createMapper`, `mapItem`, `mapInput`, `mapCreate`, `mapUpdate`, `normalizeQuery`, `buildQuery`, `createRepository` |
| `@spmiddle/sharepoint-provisioning` | `inspect/apply/verify` administrativo | `createProvisioningManager` |
| `@spmiddle/sharepoint-files` | Validação, upload, listagem e download | `validateFileInput`, `createFileClient`, `createSharePointFileClient` |
| `@spmiddle/sharepoint-rich-text` | Sanitização e guardrails | `sanitizeRichText`, `validateSafeUrl`, `validateContentLimits`, `createSafeLogger` |
| `@spmiddle/sharepoint-testing` | Fakes para testes locais | `FakeHeaders`, `fakeResponse`, `createQueueTransport`, `createListProvisioningFake` |

Os pacotes são ES modules, sem dependências de runtime. O consumidor deve
importar cada responsabilidade de seu pacote específico; o pacote REST não é
um agregador de schemas, repositories, arquivos ou segurança.

## 3. Fluxo recomendado

1. Declare um schema. Essa operação não acessa a rede.
2. Configure uma allowlist de sites e fontes.
3. Crie o transporte e o cliente de lista.
4. Crie um mapper entre domínio e nomes internos SharePoint.
5. Crie um repository sobre o cliente da fonte.
6. Use queries controladas e paginação limitada.
7. Sanitize conteúdo antes de salvar e antes de renderizar.
8. Preserve e envie ETags em alterações e exclusões.
9. Teste tudo com fake transport.
10. Execute provisioning somente em fluxo administrativo confirmado.

O startup da aplicação não deve criar listas, campos, índices ou arquivos.

## 4. Exemplo de composição

```js
import { createDataSourceRegistry } from "@spmiddle/sharepoint-rest-browser";
import { defineListSchema } from "@spmiddle/sharepoint-schema";
import { createMapper, createRepository } from "@spmiddle/data-core";
import { sanitizeRichText } from "@spmiddle/sharepoint-rich-text";

const schema = defineListSchema({
  key: "articles",
  internalName: "AppArticles",
  displayName: "Articles",
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", type: "Text", required: true },
    { internalName: "Body", type: "MultilineText" },
    { internalName: "Status", type: "Choice", choices: ["Draft", "Published"] }
  ],
  indexes: [["Status"]]
});

const sources = createDataSourceRegistry({
  allowedWebUrls: ["/sites/example"],
  sources: [{
    key: "articles",
    webUrl: "/sites/example",
    listPath: "lists/getbytitle('Articles')"
  }]
});

const mapper = createMapper({
  mapping: {
    id: { internalName: "Id", readOnly: true },
    title: { internalName: "Title", required: true },
    body: "Body",
    status: "Status"
  }
});

const articles = createRepository({
  source: "articles",
  schema,
  mapper,
  client: sources.getListClient("articles")
});

const page = await articles.findMany({
  select: ["title", "status"],
  filter: { field: "status", operator: "eq", value: "Published" },
  orderBy: [{ field: "title", direction: "asc" }],
  pageSize: 25
});

const created = await articles.create({
  title: "Example",
  body: sanitizeRichText(untrustedHtml),
  status: "Draft"
});
const updated = await articles.update(created.id, { status: "Published" }, {
  etag: created.etag
});
await articles.delete(updated.id, { etag: updated.etag });
```

O identificador usado em `update` e `delete` deve ser o identificador real da
entidade. A ETag deve vir do resultado lido ou criado.

## 5. Transporte REST

```js
import { createSharePointRestClient } from "@spmiddle/sharepoint-rest-browser";

const transport = createSharePointRestClient({
  webUrl: "/sites/example"
});
```

`webUrl` é obrigatório e deve ser server-relative (`/sites/example` ou `/`).
URL absoluta, URL protocol-relative, query, fragmento, barra invertida e outro
host são rejeitados. Barras finais são removidas.

Opções:

| Opção | Default | Contrato |
|---|---:|---|
| `fetchImpl` | `globalThis.fetch` | Implementação compatível com `fetch` |
| `sleepImpl` | timer | Espera entre retries de GET |
| `nowImpl` | `Date.now` | Relógio para digest e datas HTTP |
| `maxRetries` | `2` | Inteiro de 0 a 5, somente para GET 429/503 |

O cliente expõe `{ webUrl, request, getDigest }` e é congelado.

### `request`

```js
const result = await transport.request("/_api/web", {
  method: "GET",
  responseType: "json"
});
```

Métodos: `GET`, `POST`, `MERGE` e `DELETE`. O caminho deve permanecer no
`/_api` do site configurado. O resultado é:

```js
{ data: object | ArrayBuffer | Blob | null, etag: string | null, status: number }
```

`responseType` pode ser `json` ou `binary`. Resposta `204` ou corpo vazio
resulta em `data: null`. A ETag vem do header `ETag`, depois de
`@odata.etag` ou `__metadata.etag`.

Objetos no `body` são serializados como JSON. Conteúdo binário usa
`application/octet-stream` por padrão.

### Digest, ETag e concorrência

Toda escrita obtém automaticamente `POST /_api/contextinfo` e envia
`X-RequestDigest`. Chamadas concorrentes compartilham o digest em andamento.

`MERGE` e `DELETE` exigem ETag não vazia e são enviados como:

```text
POST
X-HTTP-Method: MERGE|DELETE
If-Match: <etag>
```

`etag: "*"` só é aceito com `allowWildcardEtag: true` e deve ser reservado a
operações administrativas explicitamente aprovadas. HTTP 412 resulta em
`concurrency-conflict`; releia e resolva o conflito na aplicação.

### Retry

Somente GET é repetido automaticamente para HTTP 429 e 503. Usa `Retry-After`
em segundos ou data HTTP; sem header, usa backoff exponencial com teto de 30 s.
Writes, digest, uploads e resultados ambíguos não são repetidos. HTTP 502 não é
repetido pelo transporte atual.

## 6. Registro de fontes e cliente de listas

```js
const registry = createDataSourceRegistry({
  allowedWebUrls: ["/sites/example"],
  sources: [{
    key: "articles",
    webUrl: "/sites/example",
    listPath: "lists/getbytitle('Articles')"
  }]
});
```

Cada fonte tem chave única, `webUrl` allowlisted e exatamente um de `listId` ou
`listPath`. GUID precisa ser válido; `listPath` precisa ser um caminho REST
seguro. Fontes sem detalhe de lista existem como metadado, mas retornam
`undefined` em `getListClient`.

Métodos do registry:

- `get(key)`: metadados congelados ou `undefined`;
- `has(key)`: verifica chave;
- `keys()`: chaves congeladas;
- `getTransport(key)`: transporte memoizado;
- `getListClient(key)`: cliente de lista memoizado.

Nunca aceite `webUrl`, `listPath` ou `listId` diretamente da UI.

O cliente de lista oferece:

- `getListItems(options)`: uma página;
- `getListItem(id, options)`: item;
- `createListItem(values)`: criação;
- `updateListItem(id, values, { etag })`: MERGE;
- `deleteListItem(id, { etag })`: exclusão;
- `getAllPages(query, { maxPages, maxItems })`: agregação limitada.

`getAllPages` tem defaults de 100 páginas e 10.000 itens. `odata.nextLink` é
aceito somente dentro do REST root configurado. Para domínio, prefira repository
e query controlada em vez de filtrar com string OData vinda da UI.

## 7. Schemas

```js
const schema = defineListSchema({
  key: "tasks",
  internalName: "AppTasks",
  displayName: "Tasks",
  template: 100,
  schemaVersion: 1,
  fields: [
    { internalName: "Title", type: "Text", required: true },
    { internalName: "Status", type: "Choice", choices: ["Open", "Closed"] },
    { internalName: "Project", type: "Lookup", lookup: { listKey: "projects" } }
  ],
  indexes: [["Status"]]
});
```

O schema é profundamente congelado e não faz rede. `key` aceita
`^[A-Za-z][A-Za-z0-9._-]*$`; nomes internos aceitam identificadores SharePoint;
`template` e `schemaVersion` devem ser válidos. Tipos aceitos incluem `Text`,
`MultilineText`, `Number`, `Integer`, `Currency`, `Boolean`, `DateTime`,
`Choice`, `Lookup`, `User` e `URL` (com aliases documentados em
[`SCHEMA-CONTRACT.md`](SCHEMA-CONTRACT.md)).

`Choice` exige escolhas não vazias e únicas. `Lookup` exige `listKey` e usa
`Title` como campo default. Índices referenciam apenas campos do próprio schema.
Propriedades desconhecidas são rejeitadas.

## 8. Mappers e repositories

```js
const mapper = createMapper({
  mapping: {
    id: { internalName: "Id", readOnly: true },
    title: { internalName: "Title", required: true },
    status: "Status"
  }
});
```

`mapItem` converte leitura; `mapCreate` exige required; `mapUpdate` aceita
parcial; `mapInput` aceita opções; `toInternal` e `toDomain` resolvem nomes.
Campo desconhecido, required ausente ou read-only em entrada gera `TypeError`.

Repository:

```js
const repo = createRepository({ source: "articles", mapper, client });
const item = await repo.findById(7);
const page = await repo.findMany({ select: ["title"] });
const count = await repo.count({});
const created = await repo.create({ title: "Draft" });
const updated = await repo.update(7, { title: "New" }, { etag: created.etag });
await repo.delete(7, { etag: updated.etag });
```

`findMany` retorna `{ items, page, nextLink, hasNextPage, pageSize }`.
Entidades são congeladas e a ETag fica em propriedade não enumerável
`entity.etag`. `findMany` e `count` limitam a 100 páginas e 10.000 itens por
default; cursor repetido produz `code: "pagination-loop"`.

## 9. Queries controladas

```js
const query = normalizeQuery({
  select: ["title", "status"],
  filter: {
    and: [
      { field: "status", operator: "eq", value: "Published" },
      { field: "title", operator: "contains", value: "Guide" }
    ]
  },
  orderBy: [{ field: "title", direction: "asc" }],
  pageSize: 20
}, mapper);
```

Operadores: `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `contains` e `beginsWith`.
`contains`/`beginsWith` exigem texto; `null` só vale para `eq`/`ne`. Filtros
compostos usam `and`/`or` com arrays não vazios. Opções de topo são apenas
`select`, `filter`, `orderBy`, `pageSize` e `top`; os dois últimos, se usados
juntos, devem ser iguais. Campos são resolvidos pelo mapper e valores são
escapados para OData. Detalhes estão em [`QUERY-CONTRACT.md`](QUERY-CONTRACT.md).

## 10. Arquivos

```js
import { createSharePointFileClient } from "@spmiddle/sharepoint-files";

const files = createSharePointFileClient({
  transport,
  libraryPath: "/sites/example/Shared Documents",
  maxSize: 10 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf"],
  allowedExtensions: [".pdf"]
});

await files.uploadFile({
  fileName: "guide.pdf",
  content: arrayBuffer,
  contentType: "application/pdf",
  folderPath: "Guides",
  overwrite: false
});
await files.listFiles({ folderPath: "Guides" });
await files.downloadFile({ folderPath: "Guides", fileName: "guide.pdf" });
```

Também existe `createFileClient`, que opera sobre `filesPath` REST explícito e
expõe `list`, `upload` e `download`. Arquivos rejeitam traversal, caminhos
absolutos, URLs, controles, MIME/extensão fora da allowlist, tamanho acima do
limite e conteúdo com aparência de Base64 ou data URL. O limite default é 10
MiB. Uploads não têm retry automático.

## 11. Rich text, URLs e logging

- `sanitizeRichText`: remove elementos ativos, eventos, estilos e URLs perigosas;
  é filtro conservador sem DOM, não substitui parser, CSP ou Trusted Types.
- `validateSafeUrl`: aceita HTTP/HTTPS sem usuário/senha; rejeita
  `javascript:`, `data:`, `vbscript:`, protocol-relative e barras invertidas.
  Relativas exigem `allowRelative: true`.
- `validateContentLimits`: retorna booleano para limites de caracteres Unicode,
  bytes UTF-8 e mínimo.
- `createSafeLogger`: oferece `debug`, `info`, `warn`, `error` e `log`, clonando
  e redigindo tokens, cookies, credenciais, digests e campos de autorização.

Sanitize antes de salvar e novamente antes de renderizar. Não registre HTML,
payloads completos, cookies, tokens ou dados pessoais.

## 12. Provisionamento administrativo

Provisionamento nunca deve fazer parte do startup:

```text
inspect → revisar plano → confirmação explícita → apply → verify
```

```js
const manager = createProvisioningManager({ schema, transport });
const inspection = await manager.inspect();
const applied = await manager.apply({
  confirm: async (plan) => administratorApproved(plan)
});
const verified = await manager.verify();
```

`inspect` é somente leitura. `apply` re-inspeciona e exige `confirm: true` ou
função que retorne truthy. `verify` faz nova leitura e indica `compatible` quando
não há ações pendentes. Índices podem ser marcados `supported: false` e pulados,
pois o endpoint varia por versão/tenant. Operações ambíguas não devem ser
repetidas cegamente. Consulte [`PROVISIONING.md`](PROVISIONING.md).

## 13. Erros e tratamento

Use códigos, não mensagens:

| Código | Conduta |
|---|---|
| `fetch-unavailable` | Configurar fetch/fetchImpl |
| `network-error` | Informar indisponibilidade; nova ação explícita |
| `access-denied` | Tratar como permissão insuficiente |
| `not-found` | Verificar source/lista |
| `concurrency-conflict` | Reler e resolver conflito |
| `throttled` | Respeitar limites; não repetir escrita |
| `request-failed` | Tratar status não previsto |
| `etag-required` | Enviar ETag exata |
| `invalid-response` | Tratar resposta inválida |
| `context-unavailable` | Corrigir webUrl |
| `confirmation-required` | Solicitar confirmação administrativa |
| `confirmation-denied` | Encerrar sem escrever |
| `pagination-loop` | Interromper e investigar resposta |

Transporte usa `SharePointRestError`, com `code`, `status`, `path`,
`retryAfterMs` e `cause` quando disponíveis. Argumentos inválidos geram
`TypeError`; tamanho de arquivo excedido gera `RangeError`.

## 14. Segurança e testes

O consumidor deve manter sites e listas em allowlist, usar HTTPS, não incluir
segredos no frontend, não aceitar caminhos da UI, validar arquivos, sanitizar
conteúdo e manter regras críticas no SharePoint ou backend confiável. O frontend
é inspecionável e não constitui uma fronteira de autorização.

Use `@spmiddle/sharepoint-testing` para testes:

```js
const fake = createQueueTransport([
  { data: { value: [{ Id: 1, Title: "Example" }] }, status: 200 }
]);
```

As chamadas ficam em `fake.calls`. Cubra schema, allowlist, mapper, queries,
paginação, ETags, 401/403/404/412/429/503, resposta vazia, XSS, URLs, arquivos,
confirmação e verificação. Não chame tenant real na suíte local.

## 15. Checklist de integração

- [ ] Imports vêm dos pacotes especializados corretos.
- [ ] Fontes e sites são allowlisted e server-relative.
- [ ] Schema não contém ambiente, segredo ou dado real.
- [ ] Mapper rejeita desconhecidos e protege read-only/required.
- [ ] Queries não aceitam OData cru da UI.
- [ ] Paginação tem limites adequados.
- [ ] Update/delete usam ETag atual.
- [ ] Escritas não têm retry cego.
- [ ] Rich text é sanitizado na entrada e saída.
- [ ] Upload valida nome, caminho, MIME, extensão e tamanho.
- [ ] Erros são tratados por código estável.
- [ ] Provisionamento está fora do startup e exige aprovação.
- [ ] Testes usam fake transport e nenhum dado real.

Não assuma que schema provisiona automaticamente, que ETag é serializada no
JSON, que `nextLink` pode sair da source, que `If-Match: *` é seguro, ou que o
frontend substitui permissões SharePoint.
