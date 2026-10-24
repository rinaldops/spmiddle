# Runbook de validação incremental em página ASPX

## Status

**Preparado para execução; não executado.** Este documento descreve uma
validação operacional futura do host MSE incremental. Ele não contém destino
corporativo, não abre navegador e não autoriza acesso a SharePoint.

O dry-run local correspondente está em
[`examples/incremental-mse-host/dry-run.js`](../examples/incremental-mse-host/dry-run.js).
Ele exercita somente o fake host e deve ser identificado por
`mode: "local-dry-run"`; seus números não são evidência de uma página ASPX.

## Objetivo

Comprovar, em uma página ASPX autorizada que já contenha o MSE, que uma ação
interna mantém a página e a raiz MSE montadas, atualizando somente a região
afetada. O resultado principal é medir zero reload completo para o fluxo interno.

## Pré-condições obrigatórias

Antes de iniciar, registrar fora do repositório público:

1. destino de produção autorizado e página ASPX específica;
2. responsável e janela de execução;
3. permissão para leitura e para a ação de teste;
4. caminho de rollback para o snippet/asset legado;
5. critérios para interromper a execução;
6. confirmação de que a ação não altera dados permanentes, ou plano de limpeza
   autorizado caso altere;
7. instância própria do FIORI-AUTO, sem reutilizar a sessão de outra equipe.

Se qualquer pré-condição faltar, permanecer em validação local.

## Isolamento obrigatório do FIORI-AUTO

Usar o projeto `app-devs/FIORI-AUTO`, conforme a diretriz do workspace. Para não
interferir em outras equipes:

- iniciar uma instância própria do agente;
- escolher porta RPC e porta CDP exclusivas para essa execução;
- usar perfil Edge próprio, fora do repositório;
- não anexar a uma sessão existente de outra equipe;
- não copiar, registrar ou compartilhar cookies, tokens, URLs de login ou
  screenshots com dados corporativos;
- encerrar a instância ao final, preservando somente resultados sanitizados.

Os valores abaixo são intencionalmente placeholders e devem ser substituídos
somente no ambiente operacional autorizado, sem gravá-los neste repositório:

```text
RPC: <porta-rpc-exclusiva>
CDP: <porta-cdp-exclusiva>
Perfil: <perfil-fiori-isolado>
Página: <aspx-autorizada>
Sessão: <id-da-sessao>
```

Não usar controlador genérico, Selenium, Playwright avulso ou CDP direto.

## Procedimento somente leitura inicial

1. Iniciar o FIORI-AUTO com o perfil e as portas exclusivas.
2. Confirmar o health-check do agente pela interface documentada.
3. Abrir a página autorizada com `browser.open` ou navegar pela sessão própria.
4. Confirmar que a página está carregada e que o MSE aparece uma única vez.
5. Capturar apenas métricas sanitizadas de baseline:
   - URL sem query, identificadores ou dados sensíveis;
   - `document.readyState`;
   - existência e contagem da raiz MSE;
   - contagem inicial de componentes/regiões;
   - timestamp relativo da medição.
6. Não publicar screenshot ou retorno bruto no repositório.

## Métricas de reload

Antes da ação, instalar somente instrumentação temporária e não persistente na
própria sessão, quando tecnicamente permitido:

- contador de `pageshow`/`load` após o baseline;
- contador de desmontagem/montagem da raiz MSE;
- contador de chamadas de navegação observáveis;
- contador de requisições da ação;
- identidade ou marcador da raiz MSE antes e depois;
- região alterada e tempo até `ready`/`empty`/`error`.

A instrumentação não deve substituir o comportamento da página nem impedir sua
navegação normal. Se não for possível medir sem alterar o fluxo, interromper e
registrar a limitação.

## Casos de teste

Executar em ordem, com dados mínimos e reversíveis:

### Ação interna de leitura

- acionar consulta, filtro ou ordenação já disponíveis no MSE;
- confirmar uma única requisição esperada;
- confirmar que a raiz mantém identidade e permanece montada;
- confirmar zero reload completo e zero navegação para a mesma ASPX;
- confirmar que somente a região de dados muda.

### Ação interna de atualização

- usar somente um registro de teste autorizado, se a escrita for indispensável;
- preservar e enviar a ETag exigida;
- confirmar resposta de sucesso ou erro tipado;
- revalidar apenas a coleção/região afetada;
- confirmar que componentes não relacionados permanecem montados;
- executar limpeza/rollback autorizado do registro de teste.

### Ação de layout/configuração

- alterar somente uma propriedade de layout suportada pelo host;
- confirmar que a raiz permanece montada;
- confirmar que somente a região visual afetada é renderizada novamente;
- confirmar preservação de foco e estado de interação.

### Fallback externo

- não tratar link externo, outra página ou mudança de contexto como atualização
  interna;
- confirmar que o host registra o fallback explicitamente;
- não executar navegação externa sem que o caso esteja autorizado.

## Critérios de aprovação

O caso interno será aprovado somente se:

1. a página ASPX não for recarregada;
2. a raiz MSE não for desmontada e remontada;
3. a métrica de navegação/reload completo permanecer zero;
4. a região esperada for a única alterada;
5. não houver erro de permissão, ETag, digest, CSP ou JavaScript;
6. a acessibilidade básica da região permanecer funcional;
7. o caminho legado continuar disponível para rollback;
8. nenhuma alteração não planejada persistir no SharePoint.

Qualquer reload inesperado, perda de estado, alteração fora da região, erro de
permissão ou divergência de dados reprova o caso e interrompe a execução.

## Rollback e encerramento

1. Interromper novas ações.
2. Restaurar o snippet/asset legado pela versão aprovada, sem apagar histórico.
3. Revalidar a página pelo caminho legado.
4. Limpar dados de teste somente se houver autorização explícita.
5. Encerrar a sessão e a instância própria do FIORI-AUTO.
6. Guardar somente relatório sanitizado: pass/fail, métricas agregadas, causa e
   commit; excluir cookies, tokens, HTML bruto, URLs sensíveis e screenshots não
   necessários.

## Resultado esperado

O resultado deve ser um relatório fora do repositório público contendo:

```text
status: <pass|fail|blocked>
fullReloads: <número>
rootRemounts: <número>
internalNavigations: <número>
affectedRegion: <identificador sanitizado>
rollback: <not-run|ready|executed>
limitações: <texto sanitizado>
```

O resultado `pass` comprova somente o caso e a página testados. Não autoriza
expandir a migração para outros módulos, páginas ou sites.
