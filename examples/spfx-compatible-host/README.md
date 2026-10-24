# Host compatível com SPFx

Este exemplo documenta um **adaptador de host compatível com SPFx** para o SPMIDDLE. Ele reproduz, em escala local e sem dependências do SharePoint Framework, as fronteiras importantes de um web part: contexto de inicialização, propriedades configuráveis, ciclo de vida previsível e atualização do estado. O objetivo é validar a integração do contrato e do serviço em Node.js, usando somente placeholders.

> Este diretório é um exemplo local/conceitual. Não inclua URLs reais, GUIDs, nomes de tenant, cookies, tokens, certificados ou dados corporativos. Use valores como `<site-server-relative>`, `<list-title>`, `<property-value>` e `<placeholder-url>`.

## O que o adaptador faz

O adaptador coloca o serviço do SPMIDDLE atrás de uma interface parecida com a fronteira de um web part SPFx:

```text
host
  ├─ recebe propriedades e contexto mínimo
  ├─ inicializa o serviço com dependências injetadas
  ├─ carrega/atualiza dados pelo contrato existente
  └─ expõe estado serializável para a camada de apresentação
```

Ele não implementa `BaseClientSideWebPart`, não cria um bundle, não renderiza React e não acessa o runtime do SPFx. “Compatível” significa compatibilidade estrutural do adaptador, não equivalência com a plataforma.

## Modelo de ciclo de vida e propriedades

O host deve manter fases explícitas e ordenadas:

1. **create** — recebe propriedades iniciais, contexto mínimo e o transporte; não faz I/O implícito.
2. **onInit** — valida valores necessários, cria o serviço e prepara o estado inicial (`loading` quando aplicável).
3. **render/update** — executa o caso de uso e publica um view-model simples; uma atualização de propriedades deve substituir a configuração anterior de forma determinística.
4. **dispose** — encerra assinaturas e libera recursos criados pelo adaptador; não deve apagar dados nem alterar serviços externos.

Uma forma ilustrativa de propriedades é:

```javascript
{
  title: "<display-title>",
  listTitle: "<list-title>",
  category: "<category-or-empty>",
  siteRelativeUrl: "<site-server-relative>"
}
```

As propriedades são configuração declarativa do consumidor, não autorização. O adaptador deve copiar/normalizar valores, rejeitar formas inválidas e não aceitar credenciais em propriedades. O contexto deve conter apenas o mínimo necessário, por exemplo:

```javascript
{
  webUrl: "<site-server-relative>",
  instanceId: "<instance-id>"
}
```

O resultado exposto deve ser plain data e serializável:

```javascript
{
  status: "loading", // "ready", "empty" ou "error"
  properties: { title: "<display-title>" },
  items: [],
  error: null
}
```

Não exponha DOM nodes, funções, promises, instâncias de contexto, headers, cookies, tokens ou objetos do SDK. Erros devem ser seguros para apresentação e não conter detalhes de autenticação ou rede.

## Por que pacotes SPFx não são dependências

`@microsoft/sp-core-library`, `@microsoft/sp-webpart-base`, `@microsoft/sp-property-pane`, React e o toolchain do SPFx não são dependências deste exemplo por decisão arquitetural:

- o SPMIDDLE fornece transporte, contratos e serviços de dados, não o runtime de UI;
- os testes locais devem rodar em Node.js, sem DOM, tenant ou pipeline de empacotamento SPFx;
- a mesma fronteira pode alimentar SPFx, HTML imperativo, React independente ou outro host;
- o consumidor real controla versões, bundler, renderer e política de dependências;
- adicionar pacotes SPFx daria a impressão incorreta de que este diretório gera um web part publicável.

Não adicione pacotes SPFx, JSX ou um bundler a este exemplo. Uma aplicação real deve instalar as dependências compatíveis no próprio projeto SPFx e fazer a ponte para o serviço/adaptador conforme sua matriz de versões.

## Execução e testes locais

Pré-requisito: Node.js `>= 20` e uma cópia local do repositório. A partir da raiz de `SPMIDDLE`:

```powershell
node examples/spfx-compatible-host/app.js
node examples/spfx-compatible-host/host.test.js
npm test
```

Os dois primeiros comandos são exemplos de execução e teste do adaptador. A suíte geral também pode incluir esse teste quando o script raiz for atualizado. Uma execução verde comprova somente composição local, estados do ciclo de vida e formato do contrato.

## Transporte fake

O transporte deve ser injetado e permanecer em memória. Sua fronteira mínima pode ser:

```javascript
const fakeTransport = {
  webUrl: "<site-server-relative>",
  async request(path, options = {}) {
    // Registrar a chamada e devolver uma resposta programada.
    return { status: 200, etag: null, data: { value: [] } };
  }
};
```

O fake pode programar sucesso, lista vazia e erro, além de registrar método, caminho e opções para asserções. Ele não deve chamar `fetch`, resolver DNS, abrir navegador ou incluir headers de autenticação. Deve usar apenas caminhos server-relative e placeholders. O fake valida a composição do adaptador; não prova que SharePoint aceitaria a chamada nem que o usuário teria permissão.

O host deve reutilizar o contrato e o serviço existentes, em vez de duplicar filtros, ordenação, mapeamentos ou nomes internos. A troca do fake por um transporte real é uma decisão de integração separada.

## Limitações

Este exemplo não valida:

- instalação, empacotamento, publicação ou carregamento por uma página SPFx;
- versões de SPFx, React, TypeScript, Fluent UI, webpack ou workbench;
- autenticação, permissões, digest, ETags, CORS, CSP, cache, throttling ou latência reais;
- renderização visual, acessibilidade, responsividade ou interação em SharePoint;
- comportamento de tenant, ciclo de vida do runtime ou concorrência de web parts;
- segurança de regras colocadas somente no frontend.

O SPMIDDLE em navegador usa a identidade e as permissões do usuário corrente. O adaptador não cria autorização adicional, não protege segredos no cliente e não transforma propriedades em uma camada de segurança.

## Não confundir com implantação SPFx real

Este exemplo não é um projeto SPFx e não produz um `.sppkg`, manifest, bundle ou solução para o App Catalog. Implantação real exigiria um projeto SPFx versionado, dependências aprovadas, build, validação do pacote, publicação no destino autorizado, testes com autenticação/permissões reais e plano de rollback.

## Não confundir com migração do `mse-platform`

O adaptador também não é migração do `mse-platform`: não altera seus módulos, não substitui serviços legados, não prova equivalência operacional ou visual e não autoriza publicação. Reutilizar um contrato demonstra apenas compatibilidade estrutural local.

Uma migração real exigiria inventário de consumidores, decisão de compatibilidade e versionamento, revisão de segurança, testes integrados e validação no destino de produção autorizado. Nenhuma dessas etapas é executada aqui.

**Significado de uma execução verde:** o adaptador, o ciclo de vida e o contrato fake passaram localmente — não que exista uma implantação SPFx nem que o `mse-platform` tenha sido migrado.
