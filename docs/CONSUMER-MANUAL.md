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
- [Seção 17](#17-layout-de-publicação-no-modern-script-editor): `Contained` e
  `FullBleed` sem alterar a aplicação pronta.

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
`odata.etag` (SharePoint classic, sem `@`), `@odata.etag` (OData v4) ou
`__metadata.etag` (`odata=verbose`).

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
`entity.etag` — **em `findMany`, isso depende do transporte devolver
`odata=minimalmetadata` (o padrão desde a correção do bug de ETag ausente em
coleções; veja §16)**, já que o SharePoint classic só inclui a ETag por item
no corpo de uma coleção filtrada sob esse nível de metadata, nunca no cabeçalho
HTTP. `findMany` e `count` limitam a 100 páginas e 10.000 itens por
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
escapados para OData. Para o SharePoint REST clássico, `contains` é emitido
como `substringof('valor',Campo)` e `beginsWith` como
`startswith(Campo,'valor')`; não use a sintaxe OData v4 equivalente. Detalhes
estão em [`QUERY-CONTRACT.md`](QUERY-CONTRACT.md).

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
- [ ] Se houver host MSE, o wrapper de publicação está separado da raiz da aplicação.
- [ ] Aplicação responde à largura do container, sem depender de `100vw`.
- [ ] Só um adaptador controla a largura; cleanup chama `dispose()`.

Não assuma que schema provisiona automaticamente, que ETag é serializada no
JSON, que `nextLink` pode sair da source, que `If-Match: *` é seguro, ou que o
frontend substitui permissões SharePoint.

## 16. Correção de contrato: ETag ausente em coleções (ação exigida do consumidor)

Um bug real foi confirmado contra um tenant real: com o `Accept` de leitura
anterior (`application/json;odata=nometadata`), o SharePoint classic REST
nunca devolve a ETag de um item obtido via **coleção filtrada**
(`items?$filter=...`, usada por `findMany`) — nem no header `ETag`, nem no
corpo. Só um GET de **item único** (`items(id)`) trazia a ETag, no header.
Qualquer repositório que localiza um registro por um campo de negócio (não
pelo Id numérico) para depois `update`/`delete` ficava com `item.etag ===
null`, e a escrita subsequente falhava sempre com `etag-required` — em todo
tenant real, não só em casos extremos.

**Correção aplicada nesta versão (não retroativa, exige ação do consumidor):**

- O `Accept` de leitura passou de `nometadata` para `minimalmetadata`
  (`DEFAULT_READ_ACCEPT`). O `Content-Type` de escrita **não mudou** e
  continua `nometadata`.
- `request()` agora lê a ETag também de `data["odata.etag"]` (chave real do
  SharePoint classic, sem `@`), antes dos fallbacks já existentes
  (`@odata.etag`, `__metadata.etag`).
- `createRepository(...).findMany(...)` agora anexa `item.etag` por item
  (igual a `findById`), lendo o mesmo `odata.etag`/`@odata.etag` do corpo de
  cada item da coleção.

**Se sua integração consome `@spmiddle/sharepoint-rest-browser` e/ou
`@spmiddle/data-core` diretamente** (não apenas via outro pacote do
monorepo):

1. Atualize para esta versão dos dois pacotes juntos — eles mudaram em
   conjunto; atualizar só um deixa o outro com a correção incompleta.
2. Se você tem testes com fakes/mocks de `fetchImpl` ou `client` que afirmam
   explicitamente `Accept === "application/json;odata=nometadata"` para
   leitura, atualize-os para `"application/json;odata=minimalmetadata"`.
3. Se você tem qualquer lógica própria (fora destes pacotes) que lê ETag
   manualmente do corpo de uma resposta do SharePoint, prefira
   `data["odata.etag"]` a `data["@odata.etag"]` quando usar `minimalmetadata`
   — o SharePoint classic retorna a primeira forma, não a segunda.
4. Revalide qualquer fluxo real de `update`/`delete` que localiza o registro
   via `findMany`/filtro (não via `findById`/Id numérico) — esse era
   exatamente o caminho que falhava.
5. Nenhuma mudança é necessária em código que só usa `findById`, `create`,
   `update` ou `delete` isoladamente, ou que já tratava `item.etag` como
    opaco (sem supor seu formato interno).

## 17. Layout de publicação no Modern Script Editor

### 17.1 Quem escolhe a largura

O publicador escolhe `Contained` ou `FullBleed` no snippet do Modern Script
Editor (MSE), sem recompilar nem editar o CSS da aplicação pronta. O adaptador
opcional em `host-adapters/modern-script-editor/` lê essa escolha e dimensiona
um **wrapper externo**, enquanto a aplicação monta em uma raiz filha:

```text
SharePoint (página, seção, autenticação e publicação)
  → wrapper SPMIDDLE (largura escolhida pelo publicador)
    → raiz da aplicação (UI responsiva ao espaço recebido)
      → pacotes SPMIDDLE (acesso aos dados)
```

Este recurso não transforma os pacotes de dados em componentes visuais. Ele não
publica arquivos, não monta frameworks, não provisiona recursos, não navega e
não altera a aplicação. O bootstrap de integração monta a aplicação pronta
depois de aplicar o layout. Não há dependência do `mse-platform`.

### 17.2 Snippet e arquivos externos

Copie estes três arquivos, mantendo-os juntos, para uma **nova pasta de assets
imutável e autorizada** em `SiteAssets`:

- `host-adapters/modern-script-editor/layout.css`;
- `host-adapters/modern-script-editor/layout.js`;
- `host-adapters/modern-script-editor/spmiddle-mse-host.js`.

Acrescente o CSS, o runtime e o bootstrap da aplicação pronta. Exemplo de snippet
com caminhos placeholders (substitua pelo site e pela versão aprovados):

```html
<link rel="stylesheet" href="/sites/example/SiteAssets/spmiddle/host-v1/layout.css">
<link rel="stylesheet" href="/sites/example/SiteAssets/my-app/app-v1/app.css">

<div data-spmiddle-host data-spmiddle-instance="my-app" data-spmiddle-layout="Contained">
  <div data-spmiddle-app-root></div>
</div>

<script src="/sites/example/SiteAssets/spmiddle/host-v1/spmiddle-mse-host.js"></script>
<script src="/sites/example/SiteAssets/my-app/app-v1/bootstrap.js"></script>
```

Para expandir, o publicador muda **somente**:

```html
data-spmiddle-layout="FullBleed"
```

O atributo sem os assets não executa nenhuma adaptação. O CSS deve estar carregado
antes da medição/montagem. O ponto de entrada é um **script externo clássico**:
algumas versões MSE ignoram tags `type="module"`. Ele usa `import()` nativo para
carregar `layout.js` como ES module. MSE, MIME, permissões e CSP precisam permitir
scripts externos, imports e CSS. Não depende de JavaScript inline, `eval` ou CDN.
Se os imports forem bloqueados, use somente um empacotamento/integrador aprovado;
não altere a segurança para contornar o bloqueio. Carregue o host antes do
bootstrap; o bootstrap deve aguardar `SPMiddleMseHost.ready`.

O exemplo completo, com aplicação e bootstrap separados, está em
[`examples/mse-layout/snippet.html`](../examples/mse-layout/snippet.html).
Esse exemplo mantém a árvore do repositório sob a pasta de assets; seus caminhos
são diferentes do exemplo acima, que coloca os três arquivos do host juntos na
raiz de `host-v1`. Em ambos os casos, preserve os imports relativos.

### 17.3 Valores e limites de cada opção

| Configuração | Espaço fornecido | Implicação para o desenvolvedor |
|---|---|---|
| `Contained` | Largura da coluna/seção/web part atual; não remove as margens do canvas SharePoint. | A UI precisa funcionar em containers estreitos. `width: 100%` refere-se ao container, não à janela. |
| `FullBleed` | Expande somente o wrapper até a caixa cliente do ancestral SharePoint mais próximo (`contentScrollRegion` ou `spPageChromeAppDiv`), limitada à largura útil da viewport. Na ausência desses ancestrais, usa a viewport. | A UI deve funcionar também em larguras grandes. O host não cancela `max-width`, padding ou espaçamento interno da aplicação. |
| Atributo ausente | Usa `Contained`. | Mesmas obrigações do modo contido. |

Os valores são case-insensitive e ignoram espaços externos (`contained` também
é aceito). Valor vazio ou desconhecido gera `TypeError`; o auto-inicializador
registra um erro no console e continua com as outras instâncias. O marcador
`data-spmiddle-host` é obrigatório; `data-spmiddle-instance` é uma identificação
de integração, não uma opção de largura.

`Contained` preserva **o espaço da seção existente**. Se a própria seção do
SharePoint já for full-width, ele não inventa margens de uma seção comum.
`FullBleed` não é fullscreen: não esconde cabeçalho, navegação, barras ou controles
do SharePoint, não ocupa automaticamente toda a altura, não solicita a
Fullscreen API e não altera configurações persistentes da página.

### 17.4 Contrato e CSS da aplicação

A aplicação recebe somente a raiz filha; não precisa ler o modo nem conhecer
os seletores SharePoint. Exemplo válido nos dois modos:

```css
.my-app {
  box-sizing: border-box;
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding: 24px;
}
```

- Em `Contained`, ela ocupa o container atual até 1200 px, sem remover as margens
  SharePoint. Se o container tiver 800 px, a aplicação terá até 800 px.
- Em `FullBleed`, ela recebe um wrapper ampliado, mas permanece limitada a
  1200 px e centralizada. Se o wrapper tiver 1600 px, o espaço restante é uma
  escolha do CSS da aplicação, **não uma falha da expansão**.
- Para usar toda a largura oferecida em ambos, a aplicação pode usar
  `max-width: none` em sua raiz; isso não a faz escapar de `Contained`.

Obrigações comuns aos dois modos:

1. Usar a largura do container (`100%`, Grid/Flexbox, e container queries quando
   necessário), não `width: 100vw` ou pressupostos sobre `window.innerWidth`.
   Media queries continuam vendo a janela: uma coluna estreita pode existir em
   uma janela larga, portanto não dependa só delas para escolher colunas.
2. Evitar larguras/mínimos fixos que excedam o espaço disponível; prever reflow
   de tabelas, imagens, texto e controles. Uma tabela larga pode ter rolagem
   local explicitamente definida.
3. Não usar margens negativas ou posicionamento `fixed`/absoluto para escapar do
   container. O host não reescreve nem recorta CSS deliberadamente escapante.
4. Não aplicar estilos ao wrapper reservado `data-spmiddle-host`, às suas
   custom properties `--spmiddle-host-*`, à classe `spmiddle-mse-host--full-bleed`
   ou aos ancestrais SharePoint. Estilizar apenas a raiz filha e seus componentes.
5. Manter acessibilidade, teclado, foco, zoom e contraste em larguras estreitas
   e amplas. O adaptador não corrige automaticamente problemas de UI.

O wrapper não é uma fronteira de segurança nem um mecanismo de clipping: não
impõe `overflow: hidden` e não garante conter CSS arbitrário. Também não remove
`max-width` ou estilos de descendentes nem altera `body`/`html`.

### 17.5 Bootstrap, refresh e cleanup

O runtime `spmiddle-mse-host.js` publica o namespace reservado
`globalThis.SPMiddleMseHost`, com `ready` (Promise que resolve o módulo contendo
`applyMseLayout`). Esse namespace não deve ser sobrescrito pela aplicação; a
primeira versão carregada permanece ativa enquanto a página estiver aberta.
Não misture versões do host na mesma página.

Ele inicializa todos os wrappers existentes ao
`DOMContentLoaded`, ou imediatamente se o documento já estiver pronto. Chamadas
repetidas para o mesmo elemento reutilizam o controller. Para garantir que a
largura já esteja aplicada **antes da montagem**, use a API no bootstrap externo
de publicação (não no código de domínio/UI):

```js
// Dentro do bootstrap externo clássico, capture antes de qualquer await:
const bootstrapUrl = document.currentScript.src;

async function mountPublishedApp(host) {
  const { applyMseLayout } = await globalThis.SPMiddleMseHost.ready;
  const { mount } = await import(new URL("./app.js", bootstrapUrl).href);
  const layout = applyMseLayout(host);
  try {
    const app = mount(host.querySelector("[data-spmiddle-app-root]"));
    return {
      refreshLayout: layout.refresh,
      dispose() {
        try {
          app.dispose();
        } finally {
          layout.dispose();
        }
      }
    };
  } catch (error) {
    layout.dispose();
    throw error;
  }
}
```

O exemplo assume `mount` síncrono que retorna `{ dispose() }`; adapte o bootstrap
ao ciclo de vida real da aplicação e preserve cleanup inclusive em falhas.
Invoque esse bootstrap após o wrapper existir; o exemplo completo demonstra
DOMContentLoaded, seleção da instância, proteção contra montagem repetida e
mensagem de erro. Os imports acima correspondem ao snippet da seção 17.2.

`applyMseLayout(host)` retorna `{ refresh, dispose }`:

- `refresh()` relê o atributo e mede novamente, sem reload nem remount; retorna
  o modo normalizado. Mudar o atributo em runtime exige chamar `refresh()`:
  não há observação automática de atributos.
- O layout acompanha `window.resize` e mudanças de largura do parent/limite via
  `ResizeObserver`, quando disponível. Sem ele, permanecem resize e refresh
  explícito. Mudanças somente de posição e hosts inicialmente ocultos podem
  exigir `refresh()` depois de aparecerem.
- `dispose()` remove listener/observer e restaura apenas a classe e as custom
  properties possuídas pelo adaptador, preservando os demais estilos. Não desmonta
  a aplicação. É idempotente, permite nova inicialização, e refresh após dispose
  não faz nada.

Não há observer global, polling, descoberta contínua de novos wrappers ou cleanup
automático na remoção do DOM. Em navegação inteligente/SPA, o integrador deve
inicializar novos hosts e dispor os antigos. Ao mover um host para outro parent,
chame `dispose()` e `applyMseLayout()` para redescobrir os limites e os alvos
observados. Uma configuração inválida em `refresh()` lança antes de alterar o
layout vigente.

### 17.6 Limitações de hospedagem e validação

- Use preferencialmente **uma seção de uma coluna** por experiência FullBleed.
  Expansão em coluna de página multicoluna pode sobrepor web parts vizinhas e
  não é suportada como estratégia de composição.
- Wrappers SPMIDDLE não podem ser aninhados; a API rejeita dupla hospedagem.
  Instâncias irmãs são independentes.
- Ancestrais com `overflow: hidden/clip`, contenção de pintura, transformações
  ou estilos incompatíveis podem recortar/distorcer a expansão. O adaptador não
  altera esses ancestrais nem promete superar recorte do MSE ou de um iframe.
  Em iframe, a viewport é a do próprio frame.
- A medição considera as bordas físicas esquerda/direita, caixa cliente e
  scrollbars (inclusive scrollbar à esquerda em RTL). Os seletores semânticos
  são dependência do host real, não uma API pública garantida do SharePoint.
  Mudanças no shell exigem revalidação; não se usam classes minificadas.
- Host oculto/desconectado, viewport sem largura ou interseção vazia permanece
  sem expansão até uma medição válida.
- **Não use dois responsáveis pela largura.** Se o `mse-platform` já controla o
  layout, mantenha esse controle ou migre explicitamente para este wrapper;
  não combine as duas expansões. Nenhum arquivo do `mse-platform` foi alterado.

Teste local: `npm run test:mse-layout` (também incluído em `npm test`). A suíte
exercita a implementação real com doubles de geometria/eventos e o runtime
externo; não comprova renderização CSS em navegador nem o DOM de um tenant.
Antes de publicação, valide com a ferramenta corporativa autorizada: edição e
leitura, mobile/desktop, zoom, LTR/RTL, abertura de menus, foco, resize e ausência
de rolagem horizontal. Confirme também CSP, MIME, imports relativos, cache e
permissões. A publicação da distribuição `0.2.0` e os testes DOM transitórios
executados estão registrados em
[`DEPLOYMENT.md`](DEPLOYMENT.md#publicação-020--6-de-novembro-de-2026).
Eles não certificam a UI de uma aplicação nem autorizam futuras publicações.

Rollback: troque para `Contained` no snippet e publique a revisão aprovada. Para
remover o adaptador em runtime, chame `dispose()`; para voltar ao host legado,
restaure o snippet anterior e remova seus assets/referências do trecho, sem
sobrescrever versões imutáveis já publicadas.
