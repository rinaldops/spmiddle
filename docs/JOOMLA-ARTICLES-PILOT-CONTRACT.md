# Contrato do piloto de artigos — `mod_articles_latest`

**Status:** contrato local definido; nenhuma lista, página ou asset foi alterado
**Lista candidata:** `mseContent`
**Operação:** somente leitura

## Escopo aprovado para a implementação local

O primeiro contrato SPMIDDLE cobre apenas o conjunto mínimo necessário para
listar artigos recentes publicados:

- uma categoria opcional por instância;
- estado `Published`;
- janela opcional de publicação (`PublishStart`/`PublishEnd`);
- ordenação por `Created` decrescente;
- quantidade limitada por `count`, padrão 5;
- leitura somente dos campos contratados.

O contrato não declara paridade total com o XML Joomla. Ficam fora desta etapa
categorias múltiplas, filtros por autor, ordenação aleatória/modificada/publicada,
layouts alternativos, sufixos CSS e cache do módulo.

## Schema candidato

| Campo | Tipo | Obrigatório | Uso |
| --- | --- | --- | --- |
| `Title` | Text | sim | título do artigo |
| `Alias` | Text | sim | alias estável |
| `EditorialState` | Choice | sim | `Published`, `Unpublished`, `Archived`, `Trashed` |
| `Featured` | Boolean | não | filtro de destaque futuro |
| `PublishStart` | DateTime | não | início da vigência |
| `PublishEnd` | DateTime | não | fim da vigência |
| `Category` | Text | não | categoria única por instância |

`Id` e `Created` são campos nativos somente leitura do SharePoint. O adapter
seleciona esses dois campos junto aos campos do schema, mas não os provisiona
como campos customizados.

## Regra de visibilidade

Um item é elegível quando:

```text
EditorialState = Published
AND (PublishStart IS NULL OR PublishStart <= now)
AND (PublishEnd IS NULL OR PublishEnd >= now)
AND (Category = category, quando a instância informar category)
```

O resultado é ordenado por `Created desc` e limitado antes de ser entregue ao
consumidor.

## Segurança e rollback

- `mseContent` é apenas um nome de contrato local; não foi criada a lista.
- O adapter usa allowlist de campos e lista.
- O cliente de teste rejeita create, update e delete.
- Nenhum runtime ou asset foi publicado.
- Antes de provisioning será necessário executar `inspect`, revisar permissões,
  confirmar o subsite de produção e preparar rollback do schema.

## Plano de inspect

O plano declarativo foi exercitado localmente com um transporte simulado de
alvo ausente. O dry-run usa o caminho server-relative autorizado
`/teams/camap-agp/db`, mas não abre conexão nem acessa o SharePoint. O resultado
esperado é `missing`, com ações propostas para a lista, campos e índices.

```powershell
node tools/prepare-joomla-articles-provisioning-plan.mjs
```

O comando deve informar:

- `mode: local-inspect-dry-run`;
- `apply: not-run`;
- `productionAccess: not-run`;
- zero chamadas diferentes de `GET`;
- ações propostas, sem executá-las.

`inspect` não equivale a aprovação de provisioning. Qualquer leitura real do
subsite e qualquer `apply` permanecem etapas administrativas separadas, sujeitas
à confirmação do destino de produção, permissões, fingerprint do plano e
rollback.

## Inspeção remota

Em 26/10/2026, o `inspect` foi executado no destino autorizado
`/teams/camap-agp/db`, usando a sessão corporativa do FIORI-AUTO e somente
requisições GET. O SharePoint respondeu que a lista não existe:

```text
List 'mseContent' does not exist at site with URL
'https://petrobrasbr.sharepoint.com/teams/camap-agp/db'.
```

O mesmo resultado foi confirmado no endpoint de campos. Resultado operacional:

```text
status: missing
list: mseContent
writes: 0
apply: not-run
```

Essa evidência apenas confirma que o alvo está ausente e que o plano de criação
pode ser revisado. Não constitui autorização para criar a lista. O provisioning
continua bloqueado até a revisão administrativa do schema, permissões, índices,
fingerprint do plano e rollback.

## Critérios de aceite local

Os testes devem comprovar:

1. schema `mseContent` válido e versionado;
2. estados não publicados excluídos;
3. datas fora da janela excluídas;
4. categoria opcional e limite aplicados;
5. ordenação `Created desc`;
6. seleção somente dos campos contratados;
7. nenhuma operação de escrita pelo piloto.
