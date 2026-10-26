# Runbook de `inspect` — piloto `mseCategories`

**Status:** preparado para execução read-only; não executado no tenant.  
**Consumidor:** `mod_articles_categories`  
**Destino:** `/teams/camap-agp/db`  
**Lista física esperada:** `mseCategories`

## Objetivo

Confirmar, sem escrita, que o subsite operacional está correto e que a lista
nova está ausente ou compatível com o schema aprovado do piloto. O `inspect`
deve produzir um plano revisável, nunca aplicar ações automaticamente.

## Pré-condições

- sessão de produção autorizada no FIORI-AUTO;
- destino conferido como `/teams/camap-agp/db`;
- nenhum uso de listas atuais como fallback físico;
- schema `MSE_CATEGORIES_SCHEMA` versionado na branch do SPMIDDLE;
- aprovação operacional registrada para a consulta read-only;
- nenhuma credencial ou evidência bruta persistida no Git.

## Sequência serializada

1. abrir o host autorizado pela `Preview.aspx`, sem alterar a página;
2. resolver o contexto server-relative do subsite `/teams/camap-agp/db`;
3. consultar a lista por título `mseCategories`;
4. consultar campos, tipos, obrigatoriedade, índices e metadados;
5. comparar a resposta com `MSE_CATEGORIES_SCHEMA`;
6. registrar somente resultado sanitizado: existência, divergências, contagens
   de campos e ações propostas;
7. interromper antes de qualquer `POST`, `MERGE`, `DELETE` ou alteração de
   permissão;
8. revisar o plano antes de considerar qualquer etapa de `apply`.

## Evidência mínima esperada

```text
destination: /teams/camap-agp/db
list: mseCategories
mode: inspect-only
writeRequests: 0
legacyListsTouched: 0
schemaVersion: 1
```

Se a lista não existir, o plano pode propor sua criação e os campos/índices,
mas o status permanece `missing` e nenhuma ação é executada.

## Critérios de parada

Interromper imediatamente se:

- o contexto não for exatamente `/teams/camap-agp/db`;
- a resposta resolver uma lista com outro nome físico;
- houver tentativa de reutilizar ou adaptar uma lista existente;
- `inspect` emitir método diferente de `GET`;
- houver divergência estrutural não catalogada;
- a consulta exigir elevação de permissão não aprovada;
- a resposta contiver dados pessoais ou corporativos desnecessários;
- houver falha de ETag, paginação, TLS ou autenticação;
- o host solicitar publicação ou reload da `Preview.aspx`.

## Rollback

O `inspect` não altera estado e, portanto, seu rollback é operacional:

1. interromper a sessão;
2. descartar evidências não sanitizadas;
3. não executar o plano retornado;
4. registrar a divergência sem modificar listas, páginas ou assets;
5. retornar ao caminho local fake até nova revisão.

Qualquer criação futura será uma etapa separada, com confirmação explícita,
plano aprovado e procedimento de reversão próprio.
