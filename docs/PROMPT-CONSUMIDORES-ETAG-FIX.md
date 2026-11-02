# Ação necessária: SPMIDDLE corrigiu um bug real de ETag em `data-core` e `sharepoint-rest-browser` — revise sua integração

## Contexto

Durante o desenvolvimento do HH-web, encontramos e corrigimos **um bug real confirmado contra um tenant SharePoint real** (não teórico, não de teste) nos pacotes compartilhados `@spmiddle/sharepoint-rest-browser` e `@spmiddle/data-core`. O bug fazia com que **toda atualização (`update`/`delete`) de um registro localizado por filtro (não pelo Id numérico) falhasse sempre** com o erro `etag-required`, mesmo quando o registro existia e a operação deveria ter sucesso.

Isso provavelmente afeta qualquer solução que:
- Usa `createRepository(...).findMany(...)` (ou `getListItems` com `$filter`) para localizar um registro por um campo de negócio (matrícula, e-mail, chave, competência, etc.), e depois chama `update()`/`delete()` nesse registro.
- Lê o campo `.etag` de um item retornado por uma coleção filtrada e espera que ele seja não-nulo.
- Tem testes/mocks que fixam o cabeçalho `Accept: application/json;odata=nometadata` para leituras.

Se sua solução só usa `findById`, `create`, `update` ou `delete` isoladamente (sem nunca passar por `findMany`/filtro antes de escrever), o bug não te afetava e a correção é transparente — mas leia mesmo assim o item 3 abaixo (extração de ETag do corpo), que também mudou o fallback usado internamente.

## Causa raiz (confirmada contra um tenant real)

1. **Cabeçalho `Accept` de leitura.** Com `Accept: application/json;odata=nometadata` (o padrão anterior), o SharePoint classic REST nunca devolve a ETag de um item obtido via **coleção filtrada** (`items?$filter=...`) — nem no header `ETag`, nem no corpo. Só um GET de **item único** (`items(id)`) trazia a ETag, e só no header. Qualquer repositório que localiza um registro por um campo de negócio ficava com `item.etag === null`.
2. **`findMany()` nunca anexava ETag por item.** Mesmo quando o corpo trazia metadata, `createRepository(...).findMany(...)` nunca extraía/anexava `item.etag` — só `findById`/`create`/`update` faziam isso. A documentação do pacote já afirmava (incorretamente) que `findMany` também anexava.
3. **Chave real do SharePoint classic é `odata.etag`, sem `@`.** O fallback de extração de ETag do corpo usava apenas `@odata.etag` (OData v4) e `__metadata.etag` (`odata=verbose`); a forma real que o SharePoint classic devolve sob `minimalmetadata` é `odata.etag` (sem `@`), e não era lida.

## O que mudou (ambos os pacotes, juntos)

- **`@spmiddle/sharepoint-rest-browser`**: o `Accept` padrão de leitura passou de `application/json;odata=nometadata` para `application/json;odata=minimalmetadata`. O `Content-Type` de escrita **não mudou** (continua `nometadata`) — isso afeta apenas o que o servidor retorna em GET, não o que você envia em POST/MERGE/DELETE.
- **`@spmiddle/sharepoint-rest-browser`**: a extração de ETag do corpo da resposta agora tenta `data["odata.etag"]` primeiro, depois `data["@odata.etag"]`, depois `data.__metadata.etag` (nessa ordem).
- **`@spmiddle/data-core`**: `createRepository(...).findMany(...)` agora anexa `item.etag` a cada item retornado (igual a `findById`), lendo o mesmo `odata.etag`/`@odata.etag` do corpo de cada item da coleção.
- **Não é retroativo.** Se você está num fork/cópia desses pacotes, ou fixa versões, precisa atualizar os dois pacotes juntos — atualizar só um deixa a correção incompleta.

## Um segundo bug relacionado, específico de consumidores do HH-web (pode existir em outras soluções com o mesmo padrão)

Separado do bug de ETag, encontramos também: se sua solução tem alguma função `xToSharePointPatch(domainObject)` que retorna um objeto já envelopado como `{ fields: { Campo: valor } }` (convenção de outro transporte/consumidor), **não passe esse retorno direto para `repository.update()`**. O mapper de `data-core` espera um objeto plano com chaves de domínio (as mesmas chaves do seu `mapping`), não um objeto pré-envelopado — isso lança `TypeError: Campo desconhecido: fields`. Desembrulhe explicitamente (`const { fields } = suaFuncaoToPatch(x)`) e remonte um objeto plano antes de chamar `update()`, ou construa o patch diretamente com as chaves de domínio, como `create()` provavelmente já faz no seu código.

## Um terceiro bug relacionado: `update()`/`delete()` podem retornar `null` mesmo com sucesso

Uma resposta real de `MERGE` do SharePoint comumente é `204 No Content` (sem corpo). Quando isso ocorre, `data-core`'s `update()` retorna `null` por completo (não um objeto com `etag: null` — o `null` inteiro), **mesmo que a escrita tenha tido sucesso e a resposta tenha trazido uma ETag fresca no header**. Qualquer código seu que faça `result.etag`, `result.algumCampo` ou `toDomainObject(result)` direto, sem checar `result == null` primeiro, vai lançar `TypeError: Cannot read properties of null`. Padrão seguro (já usado em outros repositórios do pacote):

```js
const result = await this.repository.update(id, patch, { etag })
return { item: toDomainObject({ ...snapshotAnterior, ...patch }), etag: result?.etag ?? etagAnterior }
```

Construa o item de retorno a partir do que você mesmo acabou de escrever (snapshot + patch), em vez de depender do corpo da resposta de escrita.

## O que fazer agora

1. **Atualize `@spmiddle/sharepoint-rest-browser` e `@spmiddle/data-core` juntos.**
2. **Revise testes/mocks** que fixam `Accept === "application/json;odata=nometadata"` para chamadas de leitura — atualize para `"application/json;odata=minimalmetadata"`.
3. **Revise qualquer extração manual de ETag** do corpo de uma resposta SharePoint fora destes pacotes: prefira `data["odata.etag"]` a `data["@odata.etag"]` quando usar `minimalmetadata`.
4. **Revalide todo fluxo real de `update`/`delete`** que localiza o registro via `findMany`/filtro (não via `findById`/Id numérico) — esse era exatamente o caminho que falhava sempre. Teste contra um tenant real, não só contra mocks (os mocks antigos mascaravam o bug porque simulavam uma resposta com corpo e ETag que o SharePoint real nunca devolvia nesse cenário).
5. **Revise qualquer `update()` que acesse `result.*` sem checar `result == null` primeiro.**
6. **Revise qualquer função `xToSharePointPatch()`** que devolve `{ fields: {...} }` e é passada direto para `repository.update()`/`create()` — desembrulhe antes.
7. **Nenhuma mudança é necessária** em código que só usa `findById`, `create`, `update` ou `delete` isoladamente sem depender do formato interno do etag, nem em código que já tratava `item.etag`/o retorno de `update()` como potencialmente nulo.

## Como validar que sua correção funciona

Se possível, valide contra um tenant real (não só mocks): crie um registro de teste isolado, localize-o via `findMany`/filtro (não por Id), atualize-o usando o `etag` retornado por essa busca, e confirme que a escrita retorna `200`/`204` em vez de falhar com `etag-required`. Delete o registro de teste depois.
