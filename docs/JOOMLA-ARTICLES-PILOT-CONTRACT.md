# Contrato do piloto de artigos — `mod_articles_latest`

**Status:** piloto read-only aceito após validação estrutural e funcional; nenhum registro editorial permanente, página ou asset foi alterado
**Lista candidata:** `mseContent`
**Operação:** somente leitura

## Escopo aprovado para a implementação local

O primeiro contrato SPMIDDLE cobre apenas o conjunto mínimo necessário para
listar artigos recentes publicados:

- uma categoria opcional por instância;
- estado `Published`;
- janela opcional de publicação (`Publish_start`/`Publish_end`);
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
| `Publish_start` | DateTime | não | início da vigência |
| `Publish_end` | DateTime | não | fim da vigência |
| `Category` | Text | não | categoria única por instância |

`Id` e `Created` são campos nativos somente leitura do SharePoint. O adapter
seleciona esses dois campos junto aos campos do schema, mas não os provisiona
como campos customizados.

## Regra de visibilidade

Um item é elegível quando:

```text
EditorialState = Published
AND (Publish_start IS NULL OR Publish_start <= now)
AND (Publish_end IS NULL OR Publish_end >= now)
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
- A validação autenticada read-only confirmou HTTP 200 para metadados, schema,
  consulta geral, filtro de publicados com janela de vigência e filtro por
  categoria. Todos retornaram conjunto vazio porque `ItemCount` permanece 0.
- A validação funcional autorizada foi executada com quatro fixtures temporários:
  um publicado e elegível, um não publicado, um futuro e um expirado. As
  consultas REST retornaram somente o elegível, respeitaram categoria, janela,
  ordenação e limite. Os quatro fixtures foram removidos por REST com ETags
  exatas, e a verificação final retornou `ItemCount: 0`.
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

### Estado REST após a criação-base e provisioning estrutural

Uma leitura autenticada confirmou:

```text
lista: mseContent
ItemCount: 0
campos criados: Alias, Category, Publish_start, Publish_end,
  EditorialState, Featured
/indexes: indisponível (HTTP 404)
```

A primeira tentativa REST de criar os seis campos ausentes foi rejeitada pelo
tenant com HTTP 400 porque o payload genérico incluía `__metadata` para
`SP.Field`. O adaptador foi corrigido para omitir essa propriedade no POST de
campos. A segunda tentativa criou quatro campos, mas confirmou duas limitações
adicionais do endpoint genérico: Choice exige uma operação/payload tipado e
Boolean não aceitou o valor JSON usado. Para os campos de data, o tenant derivou
os internal names `Publish_x0020_start` e `Publish_x0020_end` a partir do título,
em vez de respeitar os nomes contratuais. Esses nomes são rejeitados pelo
contrato e não serão usados como aliases.

O provisioning estrutural foi retomado somente após inspeção e confirmação
explícita. `EditorialState` foi criado como `Choice`, com as quatro opções e
default `Unpublished`; `Featured` foi criado como `Boolean`, com default falso.
Ambos foram verificados por REST com internal names aderentes. Não houve criação
de itens editoriais.

O contrato canônico passa a exigir `Publish_start` e `Publish_end`, preservando
os títulos exibidos `Publish start` e `Publish end`. Os campos legados
`Publish_x0020_start` e `Publish_x0020_end` devem ser removidos e recriados via
REST tipado, em uma migração estrutural separada. Como a lista está vazia, não
há dados editoriais a migrar; ainda assim, a remoção exige verificação e
autorização explícita.

O provisionador local usa `fields/createfieldasxml`, com XML escapado,
`Name`/`StaticName` estáveis e suporte aos tipos `Text`, `Choice`, `Boolean` e
`DateTime`. O provisioning de `EditorialState` e `Featured` foi executado por
REST tipado após novo `inspect` e confirmação explícita; a verificação final
confirmou os campos e `ItemCount: 0`.

## Plano de migração dos campos de data

O plano local para corrigir os dois internal names codificados pode ser revisado
com:

```powershell
node tools/review-joomla-articles-date-field-migration.mjs
```

Pré-condições:

```text
ItemCount: 0
legados: Publish_x0020_start, Publish_x0020_end
novos: Publish_start, Publish_end
writes no review: 0
```

Para cada campo, a ordem planejada é excluir o legado por REST, usando a ETag
obtida imediatamente antes do apply, recriar por `fields/createfieldasxml` com
`Name` e `StaticName` iguais ao nome com underscore e executar `verify`. O plano
contém exclusões e exige confirmação estrutural explícita. Nenhuma ação desse
plano foi aplicada remotamente.

Como o SharePoint não expôs ETag nos GETs dos campos, a política anterior
`exact-etag` não era aplicável. Após autorização destrutiva explícita, o plano
atual usa `wildcard-etag-explicitly-authorized` e `allowWildcardEtag: true`,
limitado aos quatro campos legados identificados. A aplicação exige inspeção
imediatamente anterior e verificação posterior.

### Regra de nomes de campos

Campos novos devem usar internal names legíveis, sem espaços e sem a codificação
REST `x0020`. A convenção é substituir espaços por underscore, por exemplo:

```text
Publish start → Publish_start
Publish end   → Publish_end
```

O display name pode continuar contendo espaços. O internal name, porém, é parte
do contrato persistente e não deve ser derivado automaticamente do título por
uma operação que produza `x0020`.

## Critérios de aceite local

Os testes devem comprovar:

1. schema `mseContent` válido e versionado;
2. estados não publicados excluídos;
3. datas fora da janela excluídas;
4. categoria opcional e limite aplicados;
5. ordenação `Created desc`;
6. seleção somente dos campos contratados;
7. nenhuma operação editorial permanente pelo piloto; fixtures temporários,
   quando autorizados, devem ser removidos e verificados.

### Gate final de aceitação

O gate final foi executado no subsite autorizado `/teams/camap-agp/db`.
`mseContent` permaneceu com `ItemCount: 0`; os campos canônicos retornaram
HTTP 200 e os fixtures temporários não existem mais. O endpoint `/indexes`
continua indisponível no tenant (`HTTP 404`) e permanece documentado como
limitação, sem impedir o contrato read-only validado.
