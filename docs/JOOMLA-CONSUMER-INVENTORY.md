# Inventário de consumidores Joomla-like

**Data:** outubro de 2026
**Escopo:** análise local para preparação do próximo piloto SPMIDDLE
**Status:** inventário registrado; nenhuma migração adicional autorizada ou executada

## Limites desta etapa

Este documento registra somente consumidores encontrados no repositório local
`mse-platform`. Não autoriza:

- alteração do `mse-platform`;
- criação ou alteração de listas SharePoint;
- publicação de páginas, scripts ou assets;
- reutilização de listas legadas;
- habilitação de escrita pelo runtime.

O piloto `mod_articles_categories`/`mseCategories` permanece concluído e não é
reaberto por este inventário.

## Matriz de candidatos

| Consumidor | Dados principais | Operação observada | Adequação para próximo piloto |
| --- | --- | --- | --- |
| `mod_articles_latest` | artigos publicados, categorias | somente leitura; filtro, destaque, quantidade e ordenação | **candidato recomendado** |
| `mod_articles_news` | artigos publicados, categorias e tags | somente leitura; filtro, destaque, exclusão do atual, quantidade e ordenação | alternativa; contrato mais amplo |
| `mod_articles_popular` | artigos publicados | somente leitura; aproxima popularidade por data porque não há telemetria de acessos | não recomendado nesta etapa |
| `mod_articles_category` | artigos por categoria | requer análise específica do contrato e do schema | candidato futuro |
| `mod_breadcrumbs` | itens publicados de `MSEMenu` | somente leitura de navegação | fora do próximo piloto de conteúdo |
| `mod_menu` | itens de menu | somente leitura de navegação | fora do próximo piloto de conteúdo |
| `mod_tags_similar` / `mod_tags_popular` | tags e relações de conteúdo | dependem de contratos de tags ainda não inventariados para este fluxo | pendente de catálogo |
| `mod_articles_archive` | artigos por janela temporal | somente leitura; exige contrato de arquivamento | candidato futuro |
| `mod_forum`, `mod_videoteca`, `mod_recursos` | domínios específicos | dependem de fontes e contratos próprios | não selecionar sem aprovação individual |

## Recomendação

O próximo candidato técnico recomendado é `mod_articles_latest`, mantendo o
piloto estritamente read-only. A recomendação se baseia em:

1. o módulo já define um contrato de domínio claro para artigos publicados;
2. o fluxo usa filtro de publicação antes da apresentação;
3. os parâmetros essenciais são pequenos e explícitos: `categoriaId`, `count`,
   `showFeatured` e `ordering`;
4. o comportamento pode ser testado localmente com fake transport;
5. não exige escrita, contador de acessos ou dependência de um novo domínio além
   de artigos e categorias.

O próximo piloto não deve incluir, na primeira rodada, campos avançados do
Joomla como cache, layout alternativo, filtro por autor ou ordenações sem
equivalente no shape atual de artigos.

## Gates antes de qualquer publicação

Para `mod_articles_latest`, ainda devem ser concluídos, nesta ordem:

1. inventário do schema Joomla de artigos e dos campos efetivamente usados;
2. definição do nome canônico da lista SPMIDDLE, sem reutilizar lista legada;
3. matriz de campos, estados publicados, vigência, categorias e índices;
4. contrato local de schema, mapper, repository e adapter;
5. testes de isolamento, allowlist, somente leitura e limites;
6. revisão do destino de produção, permissões e rollback;
7. somente após aprovação individual, provisioning controlado e validação no MSE.

Até esses gates serem aprovados, `mseCategories` continua sendo o único piloto
Joomla-like publicado no ambiente autorizado.

## Referências locais

- `mse-platform/modules/mod_articles_latest/README.md`
- `mse-platform/modules/mod_articles_latest/articles-latest-data.js`
- `mse-platform/modules/mod_articles_latest/articles-latest-settings-schema.js`
- `mse-platform/modules/mod_articles_news/README.md`
- `SPMIDDLE/docs/MIGRATION-JOOMLA-CONTRACT.md`
- `SPMIDDLE/docs/MIGRATION-JOOMLA-CATEGORIES-PACKAGE.md`
