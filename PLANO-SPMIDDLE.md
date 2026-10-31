# SPMIDDLE — Plano de desenvolvimento

**Status:** diretriz inicial; fundação técnica concluída e baseline CAMAP validado
**Escopo desta versão:** middleware JavaScript client-side para acesso estruturado a dados do SharePoint  
**Consumidor de referência para análise:** `web-devs/mse-platform`
**Local do projeto:** `web-devs/SPMIDDLE`

### Estado atual do planejamento — outubro de 2026

- a fundação REST/domínio, repositories, schemas, provisioning, segurança e
  paginação está implementada e coberta pela suíte local, agora dividida
  em pacotes especializados (`sharepoint-rest-browser`, `sharepoint-schema`,
  `sharepoint-provisioning`, `data-core`, `sharepoint-files`,
  `sharepoint-rich-text`, `sharepoint-testing`) conforme a estrutura da
  seção 15 — sem `npm workspaces`, por não haver necessidade comprovada
  (ver `docs/ARCHITECTURE.md`);
- o host CAMAP somente leitura foi validado na `Preview.aspx`, sem reload ou
  navegação interna;
- o Explore Mais foi encerrado como candidato do site CAMAP e não deve ser
  reativado nesse destino;
- nenhum código ou contrato do `mse-platform` foi alterado;
- a próxima migração funcional depende da identificação e aprovação de outro
  consumidor válido.

---

## 1. Diretriz aprovada

O SPMIDDLE será inicialmente um **middleware JavaScript executado no navegador**.
Ele fará a intermediação entre aplicações modernas e o SharePoint, abstraindo a
API REST e concentrando as preocupações comuns de persistência, consulta,
concorrência, validação e provisionamento.

```text
Aplicação frontend
    ↓
SPMIDDLE — middleware JavaScript client-side
    ↓
SharePoint REST API
    ↓
SharePoint Lists e Libraries
```

O SharePoint continuará sendo o backend de infraestrutura da solução,
responsável por:

- identidade e sessão do usuário;
- autenticação;
- autorização;
- persistência;
- listas e bibliotecas;
- versionamento nativo;
- permissões;
- API REST.

O SPMIDDLE não será, inicialmente, um servidor, uma API própria ou um backend
tradicional.

---

## 2. Objetivo do produto

Proporcionar uma camada reutilizável para que aplicações JavaScript possam usar
o SharePoint como infraestrutura de persistência e consulta sem repetir, em cada
projeto, os detalhes de sua API REST.

O SPMIDDLE deverá permitir que uma aplicação:

1. declare a estrutura de dados necessária;
2. inspecione e provisione listas e bibliotecas de forma administrativa;
3. consulte dados de maneira paginada e tipada;
4. execute CRUD sem manipular REST diretamente;
5. trate ETags e concorrência;
6. trate throttling e erros transitórios;
7. faça upload de arquivos;
8. valide e normalize dados;
9. respeite as permissões reais do usuário;
10. reutilize os mesmos contratos em diferentes frontends.

O objetivo não é transformar o SharePoint em um banco relacional genérico. O
objetivo é oferecer uma abstração pragmática, explícita e compatível com as
características reais do SharePoint.

---

## 3. Problema que o SPMIDDLE resolve

Sem uma camada comum, cada aplicação tende a repetir código para:

- montar URLs `/_api`;
- obter e renovar request digest;
- configurar headers;
- interpretar respostas REST;
- tratar respostas HTTP vazias;
- implementar paginação por `odata.nextLink`;
- construir filtros OData;
- escapar valores;
- preservar ETags;
- interpretar conflitos de concorrência;
- tratar `429` e `503`;
- fazer upload binário;
- resolver listas por GUID;
- separar nomes internos e nomes exibidos;
- provisionar campos e índices;
- sanitizar rich text;
- limitar sites e listas autorizados;
- normalizar o formato dos itens.

O SPMIDDLE centralizará esses comportamentos e permitirá que a camada superior
trabalhe com schemas, repositories, mappers e serviços de aplicação.

---

## 4. Limites da primeira versão

### 4.1 Incluído

- execução no navegador;
- SharePoint REST como transporte principal;
- listas e bibliotecas do SharePoint;
- CRUD de itens;
- consultas paginadas;
- seleção de campos;
- filtros tipados e limitados;
- ordenação;
- ETags;
- erros tipados;
- retry controlado;
- request digest;
- upload binário;
- schemas declarativos;
- inspeção de estruturas;
- provisionamento administrativo `inspect/apply/verify`;
- migrações de schema;
- registro de fontes autorizadas;
- mappers entre SharePoint e domínio;
- repositories reutilizáveis;
- sanitização de conteúdo rico;
- testes unitários, de contrato e com fake SharePoint;
- integração incremental com o `mse-platform`.

### 4.2 Fora do escopo inicial

- backend próprio;
- API HTTP própria;
- autenticação app-only;
- Azure Functions ou App Service;
- Microsoft Graph como transporte principal;
- ORM completo;
- SQL genérico;
- JOIN arbitrário;
- transações distribuídas;
- workflow;
- execução agendada sem página aberta;
- notificações confiáveis em background;
- sincronização offline;
- cache persistente complexo;
- multi-tenant;
- ACL própria;
- geração automática de telas;
- regras de negócio de módulos específicos;
- dependência de Modern Script Editor;
- dependência de Joomla ou do Site Kernel.

Essas capacidades não estão proibidas para sempre. Elas deverão ser avaliadas
somente quando houver uma necessidade concreta e documentada.

---

## 5. Backend próprio: decisão atual

O SPMIDDLE **não terá backend próprio na fase inicial**.

Isso é possível porque, no cenário client-side:

```text
Browser do usuário
    ↓ sessão autenticada
SPMIDDLE
    ↓ permissões do usuário corrente
SharePoint
```

O SharePoint já fornece a infraestrutura necessária para os casos iniciais:

- autenticação;
- autorização;
- armazenamento;
- versionamento;
- listas;
- bibliotecas;
- REST;
- controle de concorrência por ETag.

Um backend próprio poderá ser considerado futuramente quando houver necessidade
de:

- operações privilegiadas;
- processamento com a página fechada;
- jobs agendados;
- notificações assíncronas;
- integração com SAP ou outros sistemas;
- credenciais protegidas no servidor;
- auditoria centralizada;
- rate limiting;
- regras críticas que não podem ficar expostas no navegador;
- grande volume ou necessidade de cache centralizado;
- SLA específico da aplicação.

Se essa necessidade surgir, o contrato de domínio e repositories deverá ser
reaproveitado. A evolução esperada será a adição de um adaptador server-side,
não a reescrita da aplicação.

---

## 6. Arquitetura conceitual

```text
┌───────────────────────────────────────────────┐
│ Aplicação consumidora                          │
│ UI, componentes e interação                    │
├───────────────────────────────────────────────┤
│ Serviços de aplicação                          │
│ casos de uso e regras de negócio               │
├───────────────────────────────────────────────┤
│ Repositories e mappers                         │
│ entidades, comandos e projeções                │
├───────────────────────────────────────────────┤
│ Contratos de dados                             │
│ schemas, campos, filtros e relações            │
├───────────────────────────────────────────────┤
│ SPMIDDLE                                       │
│ CRUD, paginação, ETag, erros, retry, arquivos  │
├───────────────────────────────────────────────┤
│ Adaptador SharePoint REST                      │
│ digest, headers, URL, respostas e batch        │
├───────────────────────────────────────────────┤
│ SharePoint                                     │
│ Lists, Libraries, permissões e versionamento   │
└───────────────────────────────────────────────┘
```

O SPMIDDLE não terá dependência de:

- `window` como contrato de domínio;
- `document`;
- DOM;
- componentes visuais;
- CSS;
- menus;
- rotas;
- templates;
- Site Kernel;
- Modern Script Editor.

Esses recursos poderão ser usados somente por adaptadores específicos de host.

### 6.1 Atualização incremental no host

Quando uma página ASPX já estiver carregada, ações que possam ser resolvidas
com o código e os dados disponíveis no MSE devem permanecer confinadas ao
container MSE. O host deve atualizar somente estado, dados ou layout afetados,
sem recarregar a página inteira ou destruir componentes não relacionados.

Essa regra não coloca DOM ou navegação no núcleo. Ela define uma obrigação dos
adaptadores de host: raiz estável, ações internas sem navegação ASPX, estados
observáveis, proteção contra respostas obsoletas e fallback explícito somente
para mudanças externas ou de contexto. Os critérios completos estão em
[`docs/INCREMENTAL-HOST-UPDATES.md`](docs/INCREMENTAL-HOST-UPDATES.md).

---

## 7. Relação com o `mse-platform`

O `mse-platform` permanece consumidor de referência para análise de contratos,
não a definição do produto nem um consumidor autorizado para migração. O
Explore Mais foi analisado como spike e encerrado para o site CAMAP; um novo
piloto exige consumidor e destino explicitamente aprovados.

### 7.1 Conhecimentos e componentes a reutilizar

O SPMIDDLE deverá aproveitar, após análise e extração controlada, os seguintes
recursos existentes:

| Necessidade | Referência atual |
|---|---|
| cliente REST | `mse-platform/core/rest.js` |
| ETag e concorrência | `mse-platform/core/rest.js` e `configuration-store.js` |
| paginação | `mse-platform/core/rest.js` |
| upload binário | `mse-platform/core/rest.js` |
| fontes entre sites | `mse-platform/core/data-sources.js` |
| schemas de listas | `mse-platform/core/list-provisioning.js` e schemas dos módulos |
| provisionamento | `mse-platform/core/provisioning.js` |
| migrações | `mse-platform/core/settings-migrations.js` |
| sanitização | `mse-platform/core/rich-text.js` |
| testes com SharePoint simulado | `mse-platform/core/test/` |

### 7.2 O que não será levado para o SPMIDDLE

Não pertencem ao SPMIDDLE:

- `kernel/application.js`;
- `kernel/router.js`;
- `kernel/layout.js`;
- `kernel/positions.js`;
- `kernel/dispatcher.js`;
- componentes Joomla-like;
- módulos de interface;
- templates;
- tema;
- menus;
- Administrator;
- regras específicas de Fórum, Videoteca, Recursos ou Home.

### 7.3 Estratégia de extração

A extração deverá ser incremental:

1. mapear dependências do `core` atual;
2. definir contratos públicos independentes;
3. extrair o transporte REST;
4. extrair schemas e provisionamento;
5. extrair repositories e mappers;
6. criar testes de compatibilidade;
7. migrar um consumidor pequeno do `mse-platform`;
8. migrar consumidores maiores somente após estabilização;
9. manter fachadas de compatibilidade durante a transição.

Não substituir todo o `core` em uma única alteração.

Qualquer integração futura com um consumidor externo exige critérios de entrada,
gates, aceite, rollback e autorização operacional próprios. O SPMIDDLE não
autoriza alterações em consumidores nem acesso a tenant real por sua própria
documentação.

---

## 8. Modelo de dados e vocabulário

O SPMIDDLE deverá separar três representações.

### 8.1 Item cru do SharePoint

```javascript
{
  Id: 12,
  Title: "Artigo",
  Status: "Published",
  "@odata.etag": "\"3\""
}
```

### 8.2 Entidade normalizada da aplicação

```javascript
{
  id: 12,
  title: "Artigo",
  status: "published",
  etag: "\"3\""
}
```

### 8.3 Input de comando

```javascript
{
  title: "Novo título",
  status: "draft"
}
```

O item cru não deve ser exposto como modelo de domínio da aplicação.

---

## 9. Schema declarativo

Todo recurso persistido deverá possuir um schema declarativo.

Exemplo:

```javascript
const articleSchema = defineListSchema({
  key: "articles",
  internalName: "AppArticles",
  displayName: "Artigos",
  template: 100,
  schemaVersion: 1,
  fields: [
    {
      internalName: "Title",
      displayName: "Título",
      type: "Text",
      required: true
    },
    {
      internalName: "Status",
      displayName: "Status",
      type: "Choice",
      choices: ["Draft", "Published", "Archived"],
      required: true
    }
  ],
  indexes: [["Status"]]
});
```

### 9.1 Identidades obrigatórias

Cada lista deverá separar:

| Propriedade | Uso |
|---|---|
| `key` | chave lógica estável usada pelo código |
| `internalName` | nome técnico ASCII da lista ou campo |
| `displayName` | título amigável exibido às pessoas |
| `listId` | GUID físico atribuído pelo SharePoint |

O código deve operar preferencialmente por `listId` depois da descoberta. Títulos
não devem ser tratados como identidade física.

---

## 10. Repositories e mappers

O SPMIDDLE não criará inicialmente um ORM completo. Em seu lugar, utilizará:

- schemas para descrever estruturas;
- mappers para converter dados;
- repositories para encapsular operações;
- query builders limitados às capacidades do SharePoint.

### 10.1 Repository conceitual

```javascript
const articles = createRepository({
  source: "articles",
  schema: articleSchema,
  mapper: articleMapper,
  client
});
```

API inicial esperada:

```javascript
repository.findById(id, options)
repository.findMany(query, options)
repository.count(query, options)
repository.create(input, options)
repository.update(id, input, options)
repository.delete(id, options)
```

### 10.2 Consulta

```javascript
const result = await articles.findMany({
  select: ["id", "title", "status"],
  filter: {
    field: "status",
    operator: "eq",
    value: "published"
  },
  orderBy: [
    { field: "createdAt", direction: "desc" }
  ],
  pageSize: 20
});
```

O consumidor não deverá montar OData arbitrário como comportamento normal.

---

## 11. Módulos técnicos do SPMIDDLE

### 11.1 Transporte

Responsável por:

- executar requisições;
- configurar headers;
- obter e renovar digest;
- serializar payloads;
- lidar com timeout;
- lidar com cancelamento;
- interpretar respostas vazias.

### 11.2 Cliente REST

Responsável por:

- sites;
- listas;
- itens;
- campos;
- bibliotecas;
- upload;
- `$batch`;
- permissões efetivas;
- metadados.

### 11.3 Registro de fontes

Deverá manter uma allowlist de sites e fontes autorizadas.

Regras:

- usar caminhos server-relative;
- validar o site antes da operação;
- não aceitar URL arbitrária da interface;
- separar digest e cliente por `webUrl`;
- usar permissões do usuário corrente.

### 11.4 Query e paginação

Deverá oferecer:

- seleção de campos;
- filtros permitidos;
- ordenação;
- paginação por cursor;
- limite de itens;
- limite de páginas;
- escape de valores;
- proteção contra loop de paginação.

Formato recomendado:

```javascript
{
  items: [],
  page: {
    hasMore: true,
    nextCursor: "..."
  }
}
```

### 11.5 Concorrência

Atualizações e exclusões deverão aceitar ETag quando a concorrência for
relevante:

```javascript
await articles.update(id, input, {
  etag: currentItem.etag
});
```

`If-Match: *` somente poderá ser utilizado em operações administrativas
explicitamente documentadas.

### 11.6 Erros

Criar erros tipados, com códigos estáveis:

- `AuthenticationError`;
- `AuthorizationError`;
- `NotFoundError`;
- `ValidationError`;
- `ConcurrencyError`;
- `ThrottledError`;
- `TransientSharePointError`;
- `SchemaMismatchError`;
- `ProvisioningError`;
- `TransportError`;
- `UnsupportedOperationError`.

### 11.7 Retry

Tratar cuidadosamente:

- `429`;
- `502`;
- `503`;
- `Retry-After`;
- falhas transitórias de rede.

Criações não devem ser repetidas cegamente quando o resultado da primeira
tentativa for incerto.

### 11.8 Arquivos

A API de arquivos deverá suportar, inicialmente:

- upload;
- metadata;
- download conforme capacidade do host;
- exclusão condicional;
- pastas;
- MIME;
- tamanho;
- URL server-relative.

Blobs Base64 não devem ser persistidos em campos de texto.

### 11.9 Validação e rich text

Haverá validação:

1. estrutural;
2. de domínio, na aplicação consumidora;
3. de segurança.

Rich text deverá possuir formato explícito e política versionada. O conteúdo deve
ser sanitizado antes da gravação e novamente antes da renderização.

---

## 12. Provisionamento

O provisionamento ocorrerá somente em fluxo administrativo:

```text
inspect → gerar plano → confirmação → apply → verify
```

O carregamento normal da aplicação não poderá criar listas, campos, índices ou
bibliotecas.

Estados esperados:

- `missing`;
- `compatible`;
- `outdated`;
- `incompatible`;
- `access-denied`;
- `unknown`.

O resultado de uma execução deverá distinguir:

- `created`;
- `updated`;
- `unchanged`;
- `conflict`;
- `failed`.

O provisionamento deve ser idempotente e retomável. Uma resposta ambígua não
deve causar repetição cega de uma operação potencialmente já aplicada.

---

## 13. Migrações de schema

Schemas terão versões sequenciais:

```text
v1 → v2 → v3
```

As migrações devem:

- ser idempotentes quando possível;
- possuir plano de inspeção;
- informar ações destrutivas;
- preservar dados por padrão;
- produzir relatório;
- permitir verificação posterior;
- separar alteração de estrutura de alteração de conteúdo.

---

## 14. Segurança

### 14.1 Regras obrigatórias

- nunca armazenar senhas, tokens ou cookies;
- não inserir segredos no código ou em assets publicados;
- não considerar ocultação de botão como autorização;
- usar as permissões efetivas do SharePoint;
- validar sites, listas e campos permitidos;
- não aceitar URLs arbitrárias;
- não registrar conteúdo sensível;
- não relaxar TLS, CSP, proxy, Netskope ou DLP;
- usar autenticação interativa corporativa quando aplicável;
- sanitizar HTML e URLs;
- validar arquivos e MIME;
- limitar consultas e cargas.

### 14.2 Logs

Logs poderão registrar:

- operação;
- duração;
- status;
- código do erro;
- chave lógica da fonte;
- quantidade de itens;
- quantidade de retries.

Logs não deverão registrar:

- payload completo;
- HTML completo;
- tokens;
- cookies;
- conteúdo pessoal;
- dados corporativos desnecessários.

---

## 15. Estrutura inicial do projeto

```text
web-devs/SPMIDDLE/
├── PLANO-SPMIDDLE.md
├── README.md                         # a criar na implementação inicial
├── package.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── SCHEMA-CONTRACT.md
│   ├── QUERY-CONTRACT.md
│   ├── PROVISIONING.md
│   ├── ERROR-CATALOG.md
│   ├── LIMITS.md
│   └── adr/
├── packages/
│   ├── data-core/
│   ├── sharepoint-rest-browser/
│   ├── sharepoint-schema/
│   ├── sharepoint-provisioning/
│   ├── sharepoint-files/
│   ├── sharepoint-rich-text/
│   └── sharepoint-testing/
├── examples/
│   ├── vanilla-js/
│   ├── mse-host/
│   └── react/
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   └── fixtures/
└── tools/
    ├── build/
    ├── release/
    └── verify/
```

A árvore `packages/` e os documentos `docs/ARCHITECTURE.md`,
`docs/SCHEMA-CONTRACT.md`, `docs/QUERY-CONTRACT.md`, `docs/ERROR-CATALOG.md`,
`docs/LIMITS.md` e `docs/adr/` listados acima já estão implementados (outubro
de 2026), sem `npm workspaces` — ver justificativa em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). A estrutura de `examples/`,
`tests/` e `tools/` acima permanece como referência de destino; os exemplos
reais hoje vivem em `examples/<nome-do-host>/` (não em `examples/vanilla-js`,
`mse-host` ou `react` como mostrado acima) e cada pacote mantém seus próprios
testes em `packages/<pacote>/test/`.

Durante a primeira implementação, essa estrutura poderá começar menor. Não
criar pacotes vazios ou abstrações sem consumidor real.

---

## 16. Fases de implementação

### Fase 0 — Fundação e decisões

**Objetivo:** formalizar contratos e separar o que será extraído do
`mse-platform`.

**Entregas:**

- documentação do produto;
- inventário de componentes reaproveitáveis;
- API pública preliminar;
- ADR sobre transporte;
- ADR sobre autenticação client-side;
- ADR sobre schemas;
- ADR sobre repositories;
- matriz de compatibilidade.

**Aceite:** é possível identificar claramente o que pertence ao SPMIDDLE e o que
continua pertencendo à aplicação.

### Fase 1 — Transporte REST

**Entregas:**

- request genérico;
- digest;
- headers;
- timeout;
- cancelamento;
- respostas vazias;
- erros básicos;
- testes com transporte falso.

**Aceite:** o transporte roda sem dependência de DOM, MSE ou Site Kernel.

### Fase 2 — Cliente SharePoint

**Entregas:**

- listas;
- itens;
- campos;
- bibliotecas;
- CRUD;
- ETag;
- paginação;
- seleção;
- filtros básicos;
- ordenação;
- `$batch` quando comprovadamente necessário.

**Aceite:** um teste executa o ciclo criar, ler, atualizar com ETag, rejeitar ETag
obsoleta, excluir e confirmar ausência.

### Fase 3 — Schemas e fontes

**Entregas:**

- `defineListSchema`;
- identidade lógica e física;
- registro de fontes;
- allowlist;
- validação de compatibilidade;
- lookup e choices básicos;
- índices.

**Aceite:** uma mesma definição pode ser inspecionada, provisionada e usada para
criar um repository.

### Fase 4 — Repositories e mappers

**Entregas:**

- repository genérico;
- mapper;
- `findById`;
- `findMany`;
- `create`;
- `update`;
- `delete`;
- projeções;
- query tipada;
- retorno paginado.

**Aceite:** uma aplicação CRUD não conhece detalhes de `/_api`, digest,
`odata.nextLink` ou formato cru da resposta SharePoint.

### Fase 5 — Provisionamento e migrações

**Entregas:**

- `inspect`;
- `apply`;
- `verify`;
- confirmação;
- dry-run;
- relatório;
- migrações;
- detecção de incompatibilidade;
- estados idempotentes.

**Aceite:** a primeira execução altera somente o necessário e a segunda retorna
`unchanged`, sem escrita redundante.

### Fase 6 — Segurança, arquivos e conteúdo rico

**Entregas:**

- validação de arquivos;
- upload;
- sanitização;
- validação de URL;
- limites;
- logging seguro;
- erros de autorização;
- testes de XSS armazenado.

**Aceite:** conteúdo ativo é removido, Base64 não é persistido e o middleware
não simula permissões.

### Fase 7 — Primeiro consumidor real

Migrar inicialmente um módulo pequeno do `mse-platform`, preferencialmente um
catálogo simples ou o módulo Recursos antes do Fórum.

**Aceite:** o módulo mantém comportamento, paginação, concorrência, erros,
sanitização e cobertura de testes.

### Fase 8 — Hosts e exemplos

Adicionar exemplos de:

- JavaScript sem framework;
- MSE;
- React;
- host compatível com SPFx, quando aplicável.

**Aceite:** o mesmo contrato de dados funciona em mais de um host.

### Fase 9 — Avaliação de evolução

Somente após o MVP estar estável, avaliar:

- adaptador server-side;
- Microsoft Graph;
- backend próprio;
- autenticação delegada;
- jobs;
- auditoria centralizada;
- cache centralizado.

Essa fase não faz parte da primeira entrega.

---

## 17. Estratégia de testes

### 17.1 Unitários

Cobrir:

- query builder;
- escape OData;
- mappers;
- schemas;
- validações;
- erros;
- paginação;
- retry;
- ETag;
- migrações;
- sanitização;
- registro de fontes.

### 17.2 Testes de contrato

O cliente REST deverá possuir uma suíte de contrato reutilizável para qualquer
adaptador futuro.

Cobrir:

- leitura;
- criação;
- atualização;
- exclusão;
- respostas vazias;
- paginação;
- concorrência;
- upload;
- throttling;
- falha parcial.

### 17.3 Fake SharePoint

O fake deverá simular:

- listas;
- bibliotecas;
- campos;
- GUIDs;
- ETags;
- digest;
- permissões;
- throttling;
- `Retry-After`;
- paginação;
- `$batch`;
- conflitos;
- resposta ambígua;
- HTTP 200 vazio.

### 17.4 Integração real

Testes reais deverão:

- utilizar somente destino autorizado;
- usar estruturas técnicas conhecidas;
- registrar IDs e ETags temporários;
- solicitar confirmação antes de provisionar;
- limpar registros criados;
- confirmar a limpeza;
- não alterar páginas ou conteúdos fora do escopo.

Qualquer inspeção ou automação de navegador deverá seguir o FIORI-AUTO e as
diretrizes do workspace.

---

## 18. Desempenho

Regras iniciais:

- selecionar somente os campos necessários;
- paginar sempre;
- evitar expandir relacionamentos sem necessidade;
- usar índices planejados;
- limitar tamanho de resposta;
- evitar carregar listas inteiras;
- deduplicar requisições idênticas;
- limitar retries;
- medir duração e quantidade de dados;
- usar `$batch` somente quando reduzir chamadas de forma comprovada.

Métricas técnicas não deverão conter conteúdo de negócio.

---

## 19. Versionamento e publicação

O SPMIDDLE deverá adotar SemVer e contratos explícitos:

- versão da API;
- versão do schema;
- compatibilidade do adaptador;
- compatibilidade do host;
- versão dos assets.

Assets publicados no SharePoint deverão preferencialmente utilizar pastas
versionadas e imutáveis, com hashes e procedimento de rollback. Nenhum arquivo
publicado em uso deverá ser sobrescrito silenciosamente sem uma decisão técnica
específica e mecanismo de cache-busting comprovado.

O projeto não deverá conter:

- URLs corporativas reais em exemplos públicos;
- GUIDs de consumidores reais;
- tokens;
- cookies;
- certificados;
- dados pessoais;
- evidências de produção não autorizadas.

---

## 20. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| O navegador não é um ambiente confiável | Permissões continuam no SharePoint; regras críticas poderão evoluir para backend |
| Repetição de criação após falha ambígua | Reconsulta, idempotência e confirmação de estado |
| Throttling | Paginação, seleção, índices, cache limitado e retry controlado |
| Mistura entre sites | Registro de fontes, allowlist e digest vinculado ao `webUrl` |
| Duplicidade por título | Operar por `internalName` e `listId` |
| XSS armazenado | Sanitização antes de salvar e renderizar |
| Abstração excessiva | Não criar ORM completo; expor limitações reais do SharePoint |
| Acoplamento ao MSE | Core sem DOM e adaptadores de host separados |
| Falha de schema em produção | `inspect/apply/verify`, migrações e rollback |
| Cache de assets obsoleto | Publicação imutável, versionamento e hashes |
| Expectativa de transação | Documentar ausência de transação distribuída e usar compensação |

---

## 21. Critérios de sucesso do MVP

O MVP será considerado concluído quando for possível:

1. declarar um schema;
2. inspecionar a estrutura no SharePoint;
3. gerar um plano de provisionamento;
4. aplicar o plano com confirmação;
5. verificar o resultado;
6. criar um mapper;
7. criar um repository;
8. consultar dados paginados;
9. criar um item;
10. atualizar um item com ETag;
11. detectar conflito de concorrência;
12. excluir um item com ETag;
13. tratar autorização negada;
14. tratar throttling;
15. fazer upload de arquivo;
16. sanitizar rich text;
17. executar testes com fake SharePoint;
18. utilizar o mesmo contrato em uma aplicação simples e em um consumidor do `mse-platform`.

---

## 22. Definições consolidadas

### Middleware

Camada de software que intermedeia a aplicação e o SharePoint, concentrando
operações técnicas comuns.

### Backend

Servidor próprio da solução, executado fora do navegador. Não faz parte da
primeira versão do SPMIDDLE.

### ORM

Object-Relational Mapping: abstração que tenta representar tabelas e registros
como objetos genéricos. O SPMIDDLE não adotará um ORM completo inicialmente.

### Repository

Objeto que encapsula o acesso a uma entidade ou fonte de dados, mantendo os
detalhes REST fora da aplicação.

### Mapper

Conversor entre o item cru do SharePoint e a entidade usada pela aplicação.

### Schema

Descrição declarativa da estrutura esperada no SharePoint.

---

## 23. Decisões futuras que exigem reavaliação

A arquitetura deverá ser revista se surgir qualquer requisito abaixo:

- execução sem usuário conectado;
- identidade diferente do usuário corrente;
- integração com outro tenant ou hostname;
- processamento assíncrono;
- auditoria corporativa inviolável;
- transação entre múltiplas fontes;
- volume elevado;
- SLA formal;
- segredo que não pode chegar ao navegador;
- regra de negócio crítica exposta no frontend.

Nessas situações, avaliar separadamente:

- backend próprio;
- Microsoft Graph;
- Azure Functions;
- API intermediária;
- Power Automate;
- filas;
- cache centralizado;
- autenticação delegada ou app-only.

Nenhuma dessas opções deverá ser adicionada antecipadamente apenas por
antecipação de uma necessidade futura.

---

## 24. Resultado esperado

Ao final da primeira etapa, uma nova solução deverá ser desenvolvida com o
seguinte fluxo:

```text
1. Declarar o schema SharePoint
2. Provisionar administrativamente
3. Criar o mapper de domínio
4. Criar o repository
5. Implementar os casos de uso
6. Conectar o frontend
7. Executar CRUD paginado
8. Atualizar com ETag
9. Tratar erros tipados
10. Publicar sem conhecer os detalhes da API REST
```

Esse resultado transforma o SharePoint em uma infraestrutura de persistência e
consulta reutilizável, sem obrigar cada aplicação a repetir a mesma camada de
integração.
