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

## Revisão administrativa do plano

O plano foi revisado localmente contra o resultado remoto `missing`. A revisão
classifica as ações como aditivas e não destrutivas:

```text
lista: 1
campos: 7
índices: 4
destrutivas: não
inspect writes: 0
apply: não executado
```

Um fingerprint SHA-256 determinístico pode ser gerado com:

```powershell
node tools/review-joomla-articles-provisioning-plan.mjs
```

O relatório não contém GUID, token, cookie, payload editorial ou dado pessoal.
Ele registra o destino server-relative, a versão do schema, as ações propostas,
as ressalvas dos índices e o fingerprint que deverá ser conferido imediatamente
antes de qualquer `apply` autorizado.

### Rollback administrativo

O piloto não deve inserir dados durante a criação da estrutura. Se ocorrer
aplicação parcial, a operação deve ser interrompida; não se deve repetir o plano
às cegas. O procedimento é:

1. executar novo `inspect` e comparar a estrutura observada;
2. identificar somente os componentes criados por este fingerprint;
3. aplicar uma compensação estrutural explicitamente autorizada, se necessária;
4. executar nova inspeção/verificação;
5. manter o runtime e os assets inalterados até a validação final.

O relatório deixa o plano **pronto para confirmação explícita**, mas não concede
essa confirmação e não executa `apply`.

## Bloqueio operacional da criação

As rotas administrativas nativas foram verificadas pela sessão autorizada do
FIORI-AUTO, sem escrita:

- `SiteContents.aspx`: erro genérico do SharePoint;
- `viewlsts.aspx`: redirecionamento para a Home;
- `viewlsts.aspx?view=14`: Conteúdo do Site abre, mas sem comando de criação;
- `listnew.aspx` e `newlist.aspx`: erro genérico;
- `createlist.aspx`: carrega somente o shell, sem formulário.

Os detalhes técnicos exibidos pelo SharePoint informaram apenas “An unexpected
error has occurred”, sem uma causa funcional ou permissão específica. O
identificador de correlação não foi registrado no repositório.

Conclusão operacional: o plano permanece aprovado somente para revisão, porém a
criação está bloqueada pela disponibilidade da UI administrativa. O próximo
passo externo é o administrador do site investigar/restaurar a criação nativa
de listas no subsite `/teams/camap-agp/db`. Até essa correção, não usar REST de
escrita, JavaScript injetado ou outro canal alternativo para contornar a UI.

## Critérios de aceite local

Os testes devem comprovar:

1. schema `mseContent` válido e versionado;
2. estados não publicados excluídos;
3. datas fora da janela excluídas;
4. categoria opcional e limite aplicados;
5. ordenação `Created desc`;
6. seleção somente dos campos contratados;
7. nenhuma operação de escrita pelo piloto.
