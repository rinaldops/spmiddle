# Host MSE incremental

Este exemplo valida localmente a diretriz de manter o container MSE vivo quando
uma ação pode ser resolvida dentro da página já carregada. Ele não usa DOM,
navegador, rede, `window.location`, `location.reload` ou SharePoint real.

## Contrato demonstrado

- a raiz é montada uma única vez;
- consultas, filtros, atualizações e mudanças de layout afetam somente regiões
  internas;
- respostas assíncronas antigas não sobrescrevem a ação mais recente;
- ações internas não contam navegação completa;
- navegação externa/de contexto usa fallback explícito;
- estado e métricas são plain data serializável;
- o transporte é injetado e fica em memória.

O host fake usa uma fronteira simples de ações (`query`, `filter`, `update` e
`layout`). Um adaptador MSE real poderia conectar essas ações a controles da
página, preservando a raiz e renderizando somente a região afetada.

## Execução

A partir da raiz do SPMIDDLE:

```powershell
node examples/incremental-mse-host/host.test.js
node examples/incremental-mse-host/dry-run.test.js
node examples/incremental-mse-host/app.js
node examples/incremental-mse-host/dry-run.js
npm test
```

Uma execução verde comprova somente o contrato local. Ela não demonstra ainda o
comportamento de uma página ASPX real, acessibilidade visual ou publicação.

O `dry-run.js` emite um relatório JSON sanitizado no formato do runbook, com
`mode: "local-dry-run"`. Seus valores de reload, remount e navegação são
evidência do fake host, não da página ASPX.

## Runtime externo para o Modern Script Editor

Em uma página real, o diagnóstico mostrou que o Modern Script Editor renderizou
o HTML/CSS, mas não executou o `<script>` inline. O runtime separado está em
[`mse-preview-runtime.js`](mse-preview-runtime.js). O arquivo deve ser publicado
como asset externo em uma pasta estável e autorizada. O histórico do arquivo
fica no versionamento nativo do SharePoint; o histórico do código e o rollback
ficam nos commits do Git. Não criar uma pasta nova para cada versão. O trecho
de referência está em
[`mse-preview-external-script.html`](mse-preview-external-script.html).

O HTML do snippet permanece responsável pela estrutura e o runtime externo pela
montagem e pelos eventos. A publicação do asset e a substituição do trecho no
Modern Script Editor são etapas operacionais do tenant; não são feitas pela
suíte local.

## Limites

O exemplo não autoriza navegação corporativa, não acessa tenant, não altera o
`mse-platform` e não substitui a validação operacional obrigatória com FIORI-AUTO.
Uma etapa futura de produção deve medir explicitamente que ações internas não
causam reload completo e deve manter rollback para o caminho legado.
