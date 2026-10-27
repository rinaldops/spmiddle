# Plano de promoção de `Preview.aspx` para `Default.aspx`

**Status:** promoção bloqueada até a conclusão do teste integral em
`Preview.aspx`; nenhuma alteração de `Default.aspx` autorizada ou executada.

## Estado inspecionado

Em inspeção read-only pelo FIORI-AUTO no site `/teams/camap-agp`:

| Página | HTTP | Host SPMIDDLE | CAMAP | Categorias 0.1.1 | Artigos |
| --- | ---: | --- | --- | --- | --- |
| `Default.aspx` | 200 | ausente | ausente | ausente | ausente |
| `Preview.aspx` | 200 | presente | presente | presente | ausente |

`Preview.aspx` está sem check-out e renderiza o host CAMAP com 27 publicações e
`Leitura concluída: 0 categorias`. `Default.aspx` permanece fora do fluxo de
integração e não foi alterada por este gate.

## Teste funcional do preview

Em nova instância do FIORI-AUTO, sem escrita remota, foram exercitados:

- consulta textual: 27 → 2 itens;
- filtro de categoria e estado: aplicado sem navegação;
- ordenação mais antiga: aplicada sem reload;
- alternância de layout: região interna atualizada;
- ação de atualização: bloqueada com `Modo somente leitura`;
- fallback externo: registrado sem navegação automática.

O resultado final manteve uma única raiz MSE, a mesma URL e `fullReloads=0`.
Esse gate confirma o comportamento incremental do host, mas não substitui a
validação de dados editoriais reais do contrato de artigos, que permanece fora
do preview atual.

## Delta mínimo planejado

Quando houver aprovação específica para a promoção, o delta deve ser limitado
à inclusão do mesmo snippet MSE validado em `Preview.aspx`, contendo:

1. host HTML/CSS do SPMIDDLE;
2. runtime CAMAP read-only já publicado;
3. runtime de categorias `0.1.1` já publicado;
4. nenhuma referência ao runtime de artigos;
5. nenhum dado editorial novo e nenhuma alteração de permissões.

## Critérios antes da promoção

- validação funcional e visual concluída em `Preview.aspx`;
- comparação final do canvas e ETag imediatamente antes da escrita;
- rollback do canvas anterior capturado e verificável;
- alteração mínima aplicada somente em `Default.aspx`;
- publicação e inspeção posterior pelo FIORI-AUTO;
- confirmação de que `Preview.aspx` e o caminho legado continuam íntegros.

## Rollback

Remover somente o snippet SPMIDDLE de `Default.aspx` ou restaurar a versão
nativa anterior pelo histórico do SharePoint. Não remover assets de
`SiteAssets`, não alterar `Preview.aspx` e não tocar nas listas `/db`.

Este plano não autoriza a promoção. A página de produção continua sendo
`Default.aspx` sem o host SPMIDDLE.
