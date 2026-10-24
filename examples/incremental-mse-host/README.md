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
node examples/incremental-mse-host/app.js
npm test
```

Uma execução verde comprova somente o contrato local. Ela não demonstra ainda o
comportamento de uma página ASPX real, acessibilidade visual ou publicação.

## Limites

O exemplo não autoriza navegação corporativa, não acessa tenant, não altera o
`mse-platform` e não substitui a validação operacional obrigatória com FIORI-AUTO.
Uma etapa futura de produção deve medir explicitamente que ações internas não
causam reload completo e deve manter rollback para o caminho legado.
