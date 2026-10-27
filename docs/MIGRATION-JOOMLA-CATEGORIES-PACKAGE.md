# Pacote local do piloto `mseCategories`

**Status:** assets publicados em pasta estável; página conectada e validada.

Este pacote registra os assets e hashes do ponto de integração do host MSE. Os
dois assets foram publicados na pasta nova abaixo. A webpart MSE existente da
`Preview.aspx` foi editada manualmente para acrescentar somente o runtime de
categorias; o runtime CAMAP legado foi preservado.

```text
/teams/camap-agp/SiteAssets/spmiddle/preview/joomla-categories-readonly
```

## Escopo

- host: `/teams/camap-agp/Preview.aspx`;
- fonte allowlisted: `/teams/camap-agp/db`;
- lista: `mseCategories`;
- operação: somente leitura;
- escrita: zero;
- consumidor: `mod_articles_categories`;
- caminho legado: runtime CAMAP atualmente publicado.

## Conteúdo

O manifesto gerado localmente fica em `tmp/joomla-categories-package/manifest.json`
e é ignorado pelo Git. Ele contém somente hashes, tamanhos, caminhos locais,
escopo sanitizado, resultado do inspect e estado de rollback.

## Inspect remoto

Após a tentativa idempotente de provisioning, a lista `mseCategories` foi
confirmada pelo Site Contents e pela página `Lists/mseCategories/AllItems.aspx`
no web `/teams/camap-agp/db`. A confirmação detalhada foi feita de forma
read-only pela página moderna `Lists/mseCategories/NewForm.aspx`, sem preencher
ou salvar o formulário. `Preview.aspx`, permissões e itens permanecem
intocados.

O SharePoint renderizou os campos esperados:

```text
Title*        text
Alias*        text
Extension*    text
Description   note
Parent_category number
Level         number
Ordering      number
Published*    choice
Parameters_JSON note
```

Isso confirma o schema funcional do piloto. As opções da escolha `Published`
não foram alteradas nem inferidas pela UI; a definição aprovada continua sendo
`Published`, `Unpublished` e `Trashed`.

A view padrão da lista está vazia e exibe somente a coluna `Title`. Isso não é
tratado como prova de ausência dos campos do schema, porque uma coluna pode
existir na lista sem estar incluída na view. A view também não será alterada
como atalho de validação.

A tentativa de leitura pela página clássica
`/_layouts/15/listedit.aspx?List=mseCategories` retornou a página de erro
genérica do SharePoint (`Sorry, something went wrong`). Nenhuma operação de
escrita foi feita. Esse caminho não foi necessário para validar o schema, pois
a `NewForm.aspx` moderna forneceu a evidência funcional sem escrita.

## Integração da página

`Preview.aspx` foi inspecionada pelo FIORI-AUTO e o host SPMIDDLE/CAMAP atual
foi confirmado, incluindo a raiz `[data-spmiddle-mse-root]`, o runtime legado e
a região de categorias renderizada. A webpart MSE está apontando para o caminho
imutável validado:

```html
<script src="/teams/camap-agp/SiteAssets/spmiddle/preview/joomla-categories-readonly/0.1.1/mse-preview-joomla-categories-readonly-runtime.js"></script>
```

O asset corrigido foi publicado em uma pasta imutável de versão. Não se deve
sobrescrever essa versão; novas correções devem usar outra pasta versionada:

```text
existingHost: confirmed
categoriesRegion: present-and-rendered
pageWrite: manual-mse-edit-stable-path
versionedPathSwitch: verified (0.1.1)
visibleStatus: Leitura concluída: 0 categorias
```

O resultado `0 categorias` é esperado porque a lista não contém itens. Não foi
usado `browser.evaluate` para injetar JavaScript e não foi feita nova escrita
na lista.

A versão `0.1.1` corrigiu a referência do campo `ParentId` para o nome canônico
`Parent_category`. A validação em nova instância do FIORI-AUTO confirmou o
asset HTTP 200, a região renderizada e a mensagem `Leitura concluída: 0
categorias`; o asset anterior não é mais referenciado pela página.

## Aceitação remota

O teste controlado foi executado com um item temporário pela interface moderna
do SharePoint e concluído com a remoção do item:

| Estado | Resultado na `Preview.aspx` |
| --- | --- |
| `Published` | item visível; `Leitura concluída: 1 categorias` |
| `Unpublished` | item oculto; `Leitura concluída: 0 categorias` |
| `Trashed` | item oculto; `Leitura concluída: 0 categorias` |
| após limpeza | lista vazia; `Leitura concluída: 0 categorias` |

O teste confirmou que o runtime consulta somente categorias publicadas. O item
temporário foi removido pela interface SharePoint; não há item de teste ativo.

Como a conexão foi feita no MSE existente, o rollback é operacional e mínimo:

1. editar novamente a mesma webpart MSE;
2. restaurar a URL anterior do script ou remover somente a tag `<script>` do
   runtime Joomla-like;
3. usar o histórico nativo de versões do SharePoint para restaurar o arquivo,
   quando necessário;
4. manter o runtime CAMAP legado e o host atual;
5. salvar/publicar e revalidar a página pelo FIORI-AUTO.

O versionamento do código e dos manifestos é feito por commits Git. O
versionamento dos arquivos publicados é feito pelo SharePoint. Não criar novas
pastas de versão em `SiteAssets`.

## Critério para sair do estado candidato

O pacote saiu do estado candidato após a validação read-only do schema, a
conexão manual na webpart MSE e a confirmação visual do módulo. A lista continua
sem itens, portanto o piloto ainda não testa a renderização de uma categoria
real.
