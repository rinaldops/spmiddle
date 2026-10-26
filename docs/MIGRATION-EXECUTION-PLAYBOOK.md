# Playbook de execução — Migração Joomla-like para SPMIDDLE

**Status:** execução inicial autorizada  
**Branch de integração:** `feature/migrate-spmiddle-joomla`  
**Destino SharePoint de dados:** subsite operacional `/teams/camap-agp/db`  
**Host MSE de desenvolvimento:** `Preview.aspx` no site principal  
**Prefixo obrigatório:** `mse`

Este documento é a referência operacional da migração. Ele complementa os
contratos em `MIGRATION-JOOMLA-CONTRACT.md` e
`mse-platform/docs/MIGRATION-SPMIDDLE-JOOMLA.md`.

## 1. Arquitetura e fronteiras

```text
mse-platform
  componentes, módulos, plugins, templates, rotas, UI e regras de aplicação
        ↓
SPMIDDLE
  transporte, schemas, repositories, mappers, adapters e provisioning
        ↓
SharePoint /teams/camap-agp/db
  novas listas Joomla-like com prefixo mse
```

O MSE continuará sendo executado pela `Preview.aspx` do site principal. O
subsite `/db` será apenas a fonte de dados e o limite operacional das listas.

### Regras inegociáveis

- não reutilizar, renomear ou adaptar listas SharePoint existentes;
- não criar listas fora do subsite `/db`;
- nomes de listas e campos devem seguir o Joomla original;
- listas novas começam com `mse`, sem espaços, acentos ou traduções portuguesas;
- componentes usam `com_*`, módulos `mod_*`, plugins `plg_*`;
- não mover UI, rotas ou regras de negócio para o SPMIDDLE;
- não alterar o `mse-platform` fora da branch de migração;
- não publicar nem provisionar automaticamente a partir de CI;
- toda manipulação de navegador usa FIORI-AUTO;
- nenhuma credencial, cookie, token, GUID ou dado corporativo entra no Git.

## 2. Branches e worktrees

Branches de integração já existentes:

```text
SPMIDDLE:     feature/migrate-spmiddle-joomla
mse-platform: feature/migrate-spmiddle-joomla
```

Worktrees prioritárias:

| Worktree | Repositório | Responsabilidade exclusiva |
|---|---|---|
| `spmiddle-joomla-contracts` | SPMIDDLE | schemas, adapters, repositories e testes fake |
| `mse-platform-joomla-catalog` | mse-platform | catálogo Joomla de listas, campos, relações e componentes |
| `spmiddle-joomla-host` | SPMIDDLE | fonte cross-site, allowlist e configuração do host |
| `mse-platform-joomla-component` | mse-platform | primeiro `com_*` ou `mod_*` aprovado |
| `spmiddle-joomla-provisioning` | SPMIDDLE | plano `inspect/apply/verify` e rollback |

Criar inicialmente apenas as duas primeiras. As demais dependem do catálogo
aprovado e do primeiro consumidor escolhido.

Não editar o mesmo arquivo em worktrees paralelas. Arquivos compartilhados como
`kernel/application.js`, `kernel/dispatcher.js`, contratos públicos e manifests
devem ter um único proprietário por etapa.

## 3. Frentes paralelas

### Catálogo Joomla — `mse-platform`

Inventariar, sem alterar consumidores:

- componentes `components/com_*`;
- módulos `modules/mod_*`;
- plugins `plugins/<group>/plg_*`;
- templates e layouts;
- schemas Joomla originais;
- nomes canônicos de listas e campos;
- defaults, índices, relações e cardinalidade;
- comportamento de leitura e escrita.

### Contratos SPMIDDLE

Implementar inicialmente com fake transport:

- validação de nomes `mse*`;
- schemas declarativos;
- repositories e mappers;
- adapters de domínio sem UI;
- filtros, ordenação, paginação e limites;
- allowlist do subsite;
- testes de segurança e contrato.

### Qualidade e CI

Preparar verificações independentes:

```text
npm test
git diff --check
node --check nos arquivos JavaScript alterados
```

Também verificar ausência de nomes legados nas novas estruturas, URLs
corporativas e segredos.

## 4. Dependências e gates

O fluxo obrigatório é:

```text
catálogo Joomla
  ↓
contrato SPMIDDLE
  ↓
adapter do consumidor
  ↓
fake transport verde
  ↓
inspect remoto read-only
  ↓
revisão do plano
  ↓
apply somente no /db
  ↓
verify remoto
  ↓
validação pela Preview.aspx
  ↓
piloto controlado
```

Podem ocorrer em paralelo antes do catálogo fechar:

- inventário Joomla;
- contratos genéricos SPMIDDLE;
- testes fake;
- CI e linters;
- desenho de permissões e rollback.

Dependem do catálogo aprovado:

- schemas específicos;
- repositories específicos;
- adapter do primeiro consumidor;
- configuração final de fonte;
- provisioning das listas.

## 5. Operações SharePoint

Todas as operações no tenant são serializadas e executadas somente por
FIORI-AUTO:

1. confirmar destino e sessão;
2. `inspect` read-only;
3. comparar lista/campos com catálogo;
4. revisar plano e permissões;
5. `apply` somente no `/db`;
6. `verify` de campos, índices, relações e nomes internos;
7. validar consultas e permissões;
8. validar a `Preview.aspx`;
9. registrar métricas sanitizadas;
10. executar rollback se o gate falhar.

Não paralelizar criação de listas, campos, índices, permissões, publicação de
assets, alteração da página ou limpeza de fixtures.

## 6. Primeiro consumidor

O primeiro consumidor real deve ser escolhido após o catálogo e aprovado
explicitamente. Até lá, o adapter de referência permanece local.

O consumidor piloto deve:

- ser pequeno e isolável;
- ter caminho legado selecionável;
- permitir comparação fake e real;
- ter rollback claro;
- não exigir migração de todas as listas do site.

## 7. Critérios de parada

Parar e revisar se ocorrer qualquer situação abaixo:

- nome não começa com `mse`;
- espaço, acento ou tradução portuguesa em nome novo;
- tentativa de reutilizar lista atual;
- campo divergente do Joomla original;
- fonte apontando para site diferente de `/db`;
- componente executando REST diretamente;
- provisioning não idempotente;
- rollback indefinido;
- escrita concorrente no mesmo recurso;
- segredo ou dado corporativo em arquivo versionado;
- necessidade de navegador fora do FIORI-AUTO;
- falha de permissões, schema, ETag ou paginação;
- regressão de reload/navegação da `Preview.aspx`.

## 8. Critérios de aceite do primeiro piloto

- catálogo Joomla aprovado;
- schemas e nomes `mse*` aprovados;
- testes locais verdes nos dois repositórios;
- fonte allowlisted para `/db`;
- listas novas provisionadas somente após `inspect/apply/verify`;
- leitura e escrita limitadas ao contrato do consumidor;
- caminho legado preservado;
- nenhum aumento inexplicado de permissões;
- ausência de reload completo e navegação interna indevida;
- rollback exercitado ou demonstrado;
- `mse-platform` e SPMIDDLE publicados somente após revisão dos commits.

## 9. Estado inicial da execução

Nesta etapa serão criadas as worktrees de catálogo e contratos. Não haverá:

- criação de listas;
- inserção de dados;
- publicação de assets;
- alteração da `Preview.aspx`;
- alteração de `main`;
- alteração das listas atuais.
