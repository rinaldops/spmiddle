# SPMIDDLE

> Middleware JavaScript client-side para aplicações que utilizam o SharePoint
> como infraestrutura de persistência e consulta.

O SPMIDDLE inicialmente será executado no navegador e usará a sessão e as
permissões do usuário corrente para acessar o SharePoint. O projeto não terá um
backend próprio nem um ORM completo na primeira fase.

A diretriz e o planejamento completos estão em
[`PLANO-SPMIDDLE.md`](PLANO-SPMIDDLE.md).

Para integrar uma nova aplicação, comece pelo
[`docs/CONSUMER-MANUAL.md`](docs/CONSUMER-MANUAL.md). O manual reúne a
composição dos pacotes, contratos de transporte, schemas, queries, repositories,
arquivos, segurança, erros, provisionamento e testes com fake SharePoint.

## Estado do desenvolvimento

O baseline atual implementa a fundação REST e de domínio do SPMIDDLE,
dividida em pacotes especializados: `packages/sharepoint-rest-browser`
(transporte REST, list client, registro de fontes), `packages/sharepoint-schema`
(schemas declarativos), `packages/sharepoint-provisioning` (inspect/apply/verify),
`packages/data-core` (mapper, query controlada, repository), `packages/sharepoint-files`
(upload/validação de arquivos), `packages/sharepoint-rich-text` (sanitização e
guardrails de segurança) e `packages/sharepoint-testing` (fakes compartilhados
para os testes dos demais pacotes). A arquitetura e os contratos de cada
camada estão documentados em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/SCHEMA-CONTRACT.md`](docs/SCHEMA-CONTRACT.md),
[`docs/QUERY-CONTRACT.md`](docs/QUERY-CONTRACT.md),
[`docs/ERROR-CATALOG.md`](docs/ERROR-CATALOG.md),
[`docs/LIMITS.md`](docs/LIMITS.md) e nos ADRs em [`docs/adr/`](docs/adr/).

O runtime incremental CAMAP foi validado em `Preview.aspx` com integração somente leitura;
ele não substitui o `mse-platform`.

Estado operacional do baseline:

- `main`/`origin/main`: `83183d6`;
- asset CAMAP publicado em pasta imutável `.../preview/...-v9/`;
- `Preview.aspx`: `rootMounts=1`, `fullReloads=0`, `internalNavigations=0`;
- Explore Mais: não é consumidor válido do site CAMAP e foi despublicado;
- lista técnica temporária `RecursosLinks`: removida do site;
- `mse-platform`: não alterado.

```powershell
npm test
```

O pacote de transporte não depende de bibliotecas externas, DOM, Modern Script
Editor ou Site Kernel. O acesso a um tenant real não faz parte da suíte local;
os testes usam um transporte HTTP simulado.

## Limites de segurança

O SPMIDDLE executado no navegador usa a identidade e as permissões do usuário
corrente. Ele não fornece autenticação privilegiada, não protege segredos no
frontend e não transforma a interface em uma camada de autorização. Consulte
[`SECURITY.md`](SECURITY.md) antes de integrar o projeto.

## Objetivos iniciais

- cliente SharePoint REST reutilizável;
- CRUD de itens;
- paginação e consultas tipadas;
- ETags e concorrência;
- schemas declarativos;
- provisionamento administrativo `inspect/apply/verify`;
- repositories e mappers;
- tratamento de erros e throttling;
- upload de arquivos;
- integração incremental com o `mse-platform`.

O primeiro spike de consumidor está em
[`examples/first-consumer-recursos/`](examples/first-consumer-recursos/). Ele
valida localmente a compatibilidade do contrato de leitura do Explore Mais sem
alterar o repositório `mse-platform`. A consulta real foi testada durante a
auditoria, mas o consumidor foi descartado para o site CAMAP e não está
publicado.

A diretriz para manter o container MSE vivo e evitar reload completo da página
em ações internas está em
[`docs/INCREMENTAL-HOST-UPDATES.md`](docs/INCREMENTAL-HOST-UPDATES.md).

O contrato local executável dessa diretriz está em
[`examples/incremental-mse-host/`](examples/incremental-mse-host/).

## Escopo futuro

Backend próprio, Microsoft Graph, processamento assíncrono e outras capacidades
mais complexas serão avaliados somente quando houver uma necessidade concreta.
