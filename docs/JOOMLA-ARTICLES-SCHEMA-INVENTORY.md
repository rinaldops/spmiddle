# Inventário do schema de artigos — `mod_articles_latest`

**Data:** outubro de 2026
**Consumidor:** `mod_articles_latest`
**Status:** inventário local concluído; contrato SPMIDDLE e provisioning ainda não autorizados

## Escopo e fontes

Este inventário compara somente contratos locais. Nenhuma lista SharePoint,
página, asset ou consumidor foi alterado.

Fontes analisadas:

- `web-devs/JOOMLA/modules/mod_articles_latest/mod_articles_latest.xml`;
- `web-devs/mse-platform/modules/mod_articles_latest/README.md`;
- `web-devs/mse-platform/modules/mod_articles_latest/articles-latest-data.js`;
- `web-devs/mse-platform/modules/mod_articles_latest/articles-latest-settings-schema.js`;
- `web-devs/mse-platform/kernel/article-mapper.js`;
- `web-devs/mse-platform/kernel/articles-data.js`;
- `web-devs/mse-platform/kernel/publisher-data.js`;
- `web-devs/mse-platform/kernel/content-services.js`;
- `web-devs/mse-platform/kernel/test/article-mapper.test.js`;
- `web-devs/mse-platform/kernel/test/articles-data.test.js`.

## Campos de configuração do Joomla

| Campo Joomla | Tipo/validação | Uso no módulo | Situação no `mse-platform` |
| --- | --- | --- | --- |
| `catid` | categoria múltipla, inteiros | restringe artigos às categorias selecionadas | **lacuna:** `categoriaId` atual é singular |
| `count` | inteiro, mínimo 1, padrão 5 | limita a quantidade retornada | coberto por `count` |
| `show_featured` | todos, ocultar ou somente destacados | filtra o campo de destaque | coberto por `showFeatured` |
| `ordering` | criação, modificação, publicação, toque ou aleatório | ordena o resultado | **paridade parcial:** somente recentes por `criadoEm` ou título |
| `user_id` | qualquer, criado por mim, não criado por mim, autor específico | filtra autoria | fora do shape atual de artigos |
| `author` | múltiplos autores | complemento de `user_id=created_by` | fora do shape atual de artigos |
| `layout` | layout alternativo | altera apresentação | fora do escopo read-only inicial |
| `moduleclass_sfx` | sufixo CSS | altera apresentação | fora do escopo do adapter |
| `cache` / `cache_time` / `cachemode` | configuração de cache | controla cache do módulo | fora do runtime SPMIDDLE inicial |

## Shape de artigo observado

O `mse-platform` já possui um shape de domínio reutilizável para a família
`mod_articles_*`:

| Campo lógico | Campo SharePoint default atual | Necessário para `mod_articles_latest` | Observação |
| --- | --- | --- | --- |
| `id` | `Id` | sim | identificador nativo |
| `titulo` | `Title` | sim | título exibido |
| `slug` | `Slug` | não para o filtro atual | útil para link futuro |
| `resumo` | `Resumo` | não para o serviço de dados | apresentação do módulo pode usar depois |
| `corpoHtml` | `CorpoHtmlSeguroV1` | não | não carregar sem necessidade |
| `estado` | `EstadoEditorial` | sim | somente `Publicado` entra |
| `categoriaId` | `CategoriaTexto` | sim, com ressalva | atualmente texto/valor único; não é FK formal |
| `tags` | `TagsTexto` | não | não usado pelo candidato |
| `destaque` | `Destaque` | sim | usado por `showFeatured` |
| `ordemDestaque` | `OrdemDestaque` | não | não usado na ordenação atual |
| `publicarDe` | `DataPublicacao` | sim para vigência | filtro de janela |
| `publicarAte` | `DataExpiracao` | sim para vigência | filtro de janela |
| `imagemCapaUrl` | `ImagemUrl` | não | fora do primeiro contrato |
| `criadoEm` | `Created` nativo | sim para `maisRecentes` | recebido sem depender de campo customizado |

## Campos mínimos candidatos

O próximo contrato read-only deve selecionar somente os campos necessários ao
comportamento aprovado, evitando trazer corpo HTML, tags e imagem até haver
necessidade explícita:

```text
Id
Created
Title
EstadoEditorial
Destaque
DataPublicacao
DataExpiracao
CategoriaTexto
```

Essa seleção é uma proposta de contrato, não uma instrução de provisioning.
O nome da lista ainda deve ser definido a partir do schema aprovado; `mseContent`
é apenas a convenção candidata registrada no contrato geral e não foi criado.

## Lacunas e decisões pendentes

### 1. Múltiplas categorias

O XML Joomla declara `catid` como múltiplo. O serviço atual recebe um único
`categoriaId` e resolve categoria por Id, alias ou título. Antes de alegar
paridade, será necessário escolher uma destas opções:

- limitar explicitamente o piloto a uma categoria por instância;
- aceitar uma lista de categorias no adapter e definir a semântica OR;
- modelar uma relação artigo–categoria em contrato próprio.

Nenhuma opção foi escolhida nesta etapa.

### 2. Ordenação

O Joomla oferece cinco modos. O contrato atual oferece somente:

- `maisRecentes`, baseado em `Created`/`criadoEm`;
- `titulo`, ordenação alfabética adicional da implementação atual.

Não há paridade comprovada para data de publicação, modificação, toque ou
aleatoriedade. O primeiro piloto deve declarar essa limitação no aceite.

### 3. Autoria

`user_id` e `author` exigem um campo ou relacionamento de autor no shape de
artigo. Como essa informação não está presente no contrato atual, o filtro de
autoria deve permanecer fora do escopo inicial.

### 4. Lista e nomes reais

O `mse-platform` resolve a lista por configuração (`CAMAPPublicacoes`,
`MSEPublicacoes` e fallbacks legados). O SPMIDDLE não deve reutilizar essas
listas. A lista nova precisa de nome canônico `mse*`, schema declarativo próprio,
allowlist do subsite e plano de rollback antes de qualquer acesso de produção.

## Critério para a próxima etapa

O inventário será considerado pronto para revisão quando o contrato aprovado
responder explicitamente:

1. se o primeiro piloto suporta uma ou várias categorias;
2. qual ordenação mínima será aceita;
3. quais campos são obrigatórios e quais ficam fora do select;
4. qual nome canônico de lista será usado;
5. como estados e vigência serão filtrados;
6. quais testes locais provarão leitura, isolamento, limites e somente leitura.

Até essa revisão, `mseCategories` continua sendo o único piloto Joomla-like
publicado no ambiente autorizado.
