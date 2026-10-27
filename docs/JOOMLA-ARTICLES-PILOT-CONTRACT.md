# Contrato do piloto de artigos — `mod_articles_latest`

**Status:** lista-base criada; provisioning REST parcial interrompido; nenhum registro, página ou asset foi alterado
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

- `mseContent` foi criada como lista vazia pela UI nesta sessão, apenas como
  intervenção pontual; a UI não é o fluxo operacional consolidado do SPMIDDLE.
- O fluxo canônico de criação/alteração/exclusão é o cliente REST do SPMIDDLE,
  com `inspect → plan → confirmação explícita → apply → verify`.
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

## Histórico da criação da lista e fluxo canônico

Antes da correção do procedimento, as rotas administrativas nativas foram
verificadas pela sessão autorizada do FIORI-AUTO. A opção `New > List` foi então
identificada e usada uma única vez para criar a lista-base vazia. Esse passo é
histórico e não deve ser consolidado como procedimento de provisioning:

- `SiteContents.aspx`: erro genérico do SharePoint;
- `viewlsts.aspx`: redirecionamento para a Home;
- `viewlsts.aspx?view=14`: Conteúdo do Site abre, mas sem comando de criação;
- `listnew.aspx` e `newlist.aspx`: erro genérico;
- `createlist.aspx`: carrega somente o shell, sem formulário.

Os detalhes técnicos exibidos pelo SharePoint informaram apenas “An unexpected
error has occurred”, sem uma causa funcional ou permissão específica. O
identificador de correlação não foi registrado no repositório.

O fluxo operacional passa a ser exclusivamente REST pelo SPMIDDLE. A UI pode
ser usada apenas para diagnóstico visual ou recuperação administrativa, nunca
como etapa necessária do processo de dados.

### Estado REST após a criação-base e tentativa parcial

Uma leitura autenticada confirmou:

```text
lista: mseContent
ItemCount: 0
campos criados: Alias, Publish start, Publish end, Category
campos ausentes: EditorialState, Featured
/indexes: indisponível (HTTP 404)
```

A primeira tentativa REST de criar os seis campos ausentes foi rejeitada pelo
tenant com HTTP 400 porque o payload genérico incluía `__metadata` para
`SP.Field`. O adaptador foi corrigido para omitir essa propriedade no POST de
campos. A segunda tentativa criou quatro campos, mas confirmou duas limitações
adicionais do endpoint genérico: Choice exige uma operação/payload tipado e
Boolean não aceitou o valor JSON usado. Para os campos de data, o tenant derivou
os internal names `Publish_x0020_start` e `Publish_x0020_end` a partir do título,
em vez de respeitar os nomes contratuais.

O provisioning foi interrompido antes de nova escrita. A compensação, se
necessária, deve ser feita somente por REST e com autorização explícita; não há
itens para preservar ou remover. O próximo plano deve usar o endpoint REST
específico de criação de campos tipados e decidir formalmente se os nomes
derivados serão aceitos ou se os quatro campos serão removidos e recriados com
schema XML/internal names estáveis.

Como a lista permanece vazia, foi adotada a reconciliação não destrutiva dos
nomes efetivos das datas: o contrato local passa a referenciar
`Publish_x0020_start` e `Publish_x0020_end`, preservando os títulos exibidos
`Publish start` e `Publish end`. Não serão removidos nem recriados campos
existentes apenas para normalizar seus nomes internos.

O provisionador local agora usa `fields/createfieldasxml`, com XML escapado,
`Name`/`StaticName` estáveis e suporte aos tipos `Text`, `Choice`, `Boolean` e
`DateTime`. A suíte completa foi atualizada e passou. Nenhuma nova escrita
remota foi executada após essa correção; a retomada exige novo `inspect`, revisão
dos quatro campos existentes e confirmação explícita do plano REST corrigido.

## Critérios de aceite local

Os testes devem comprovar:

1. schema `mseContent` válido e versionado;
2. estados não publicados excluídos;
3. datas fora da janela excluídas;
4. categoria opcional e limite aplicados;
5. ordenação `Created desc`;
6. seleção somente dos campos contratados;
7. nenhuma operação de escrita pelo piloto.
