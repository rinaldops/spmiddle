# SPMIDDLE — Arquitetura

## Visão geral

SPMIDDLE é um middleware JavaScript client-side para SharePoint, com contratos explícitos para:

- transporte REST (browser) e autenticação via sessão do host;
- schemas e mappers;
- repositories;
- provisioning (inspect/plan/apply/verify);
- gates de segurança e evolução aditiva.

## Componentes

- `packages/sharepoint-rest-browser`: transporte Fetch/REST + headers/digest.
- `packages/sharepoint-schema`: modelos de schema e validação.
- `packages/sharepoint-provisioning`: inspect/plan/apply/verify de fields.
- `packages/data-core`: utilitários core (page, query, errors).
- `packages/sharepoint-files`: upload/download de arquivos (quando usado).
- `packages/sharepoint-rich-text`: sanitização/contratos de rich text.
- `host-adapters/modern-script-editor`: host layout Contained/FullBleed (sem mexer em max-width global).

## Compatibilidade de host

- Não desabilitar CSP/TLS/proxy.
- Não assumir browser/tenant: os exemplos são offline e usam doubles.
- Layout MSE: CSS escopado no wrapper; nunca altera overflow global nem max-width da aplicação.

## Atualizações incrementais no host

- Atualização de host deve ser seletiva e versionada (assets imutáveis).
- Rollback é por versão anterior, não por sobrescrita.
