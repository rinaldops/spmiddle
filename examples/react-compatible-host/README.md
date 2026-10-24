# Host compatível com React

Este exemplo documenta um **host compatível com React**: uma camada de
apresentação que pode entregar o modelo consumido por uma futura view React,
mas que executa localmente sem React, sem DOM e sem navegador. O objetivo é
validar a fronteira entre host, contrato de dados, serviço de aplicação e
view-model sem transformar o SPMIDDLE em uma biblioteca de UI.

> Este diretório é um exemplo conceitual/local. Use somente placeholders; não
> inclua URLs, GUIDs, nomes de tenant, cookies, tokens ou dados corporativos.

## O que “compatível com React” significa

O host segue uma convenção útil para React — entrada declarativa, dados
serializáveis e estado explícito — e pode ser conectado a componentes React no
futuro. Ele **não renderiza componentes React** nem implementa o runtime de
React. A divisão é:

```text
host compatível
    ↓ injeta dependências e executa o caso de uso
contrato/serviço do consumidor
    ↓ devolve domínio normalizado
view-model serializável
    ↓ poderia ser recebido por uma view React
React (opcional, fora deste exemplo)
```

O host não deve conhecer JSX, hooks, ciclo de vida de componentes, contexto
React, roteamento ou detalhes visuais. Uma view React é apenas uma possível
consumidora do resultado.

## Por que React não é uma dependência

React não é dependência deste exemplo por decisão arquitetural, não por uma
limitação acidental:

- o SPMIDDLE fornece acesso a dados e contratos, não uma implementação de UI;
- testes locais ficam determinísticos e podem rodar em Node.js, sem DOM;
- o mesmo serviço pode alimentar React, outro framework, HTML imperativo ou um
  host não visual;
- o consumidor decide se precisa de React e controla sua própria versão,
  bundler, renderer e política de dependências;
- não se cria um pacote de produção ou um bundle de SharePoint apenas para
  demonstrar uma forma de apresentação.

Portanto, não adicione `react`, `react-dom`, JSX ou um bundler a este diretório.
Se uma aplicação real escolher React, ela deverá instalar e configurar essas
dependências no próprio projeto de UI.

## Como executar

Pré-requisito: Node.js `>= 20` e uma cópia local do repositório. A partir da
raiz de `SPMIDDLE`:

```powershell
npm test
```

Quando houver um entrypoint implementado para este exemplo, sua execução deve
seguir o padrão abaixo:

```powershell
node examples/react-compatible-host/app.js
```

O fluxo deve usar transporte fake ou estado em memória. Ele não deve abrir
navegador, fazer DNS, chamar HTTP, acessar SharePoint ou exigir sessão. Uma
execução verde prova somente a composição local e o formato do view-model.

## Reuso do contrato

O host deve reutilizar o contrato do consumidor e o adaptador/serviço existente,
em vez de duplicar nomes de campos, filtros ou regras de domínio. Para o caso
de Explore Mais, a forma pode ser equivalente a:

```javascript
const service = createRecursosCompatibilityService({
  source: {
    webUrl: "/sites/<site-name>",
    listPath: "lists/getbytitle('<list-title>')/items"
  },
  client: fakeClient
});

const viewModel = await service.getViewModel();
```

O contrato continua definindo a fonte lógica, seleção, filtro, ordenação,
paginação, mapeamento e semântica de erro. O host somente injeta o transporte e
converte o resultado já normalizado para a forma de apresentação. Nenhum fake
deve alterar o contrato para parecer uma API real.

Para o contrato de links, mantenha apenas valores fictícios, por exemplo:

```javascript
{
  Id: "<item-id>",
  Title: "<display-title>",
  URL: "<placeholder-url>",
  Categoria: "<category>",
  Ativo: true
}
```

## Forma do view-model

O view-model deve ser simples, estável e serializável. Ele representa estado de
apresentação, não elementos ou instâncias do framework:

```javascript
{
  status: "ready", // "loading", "empty" ou "error"
  title: "<list-title>",
  groups: [
    {
      key: "<category>",
      label: "<category-label>",
      items: [
        {
          id: "<item-id>",
          label: "<display-value>",
          href: "<placeholder-url>",
          openInNewWindow: false
        }
      ]
    }
  ],
  error: null
}
```

Regras importantes:

- não inclua DOM nodes, funções, promises, instâncias de SharePoint, tokens,
  cookies ou objetos de contexto;
- mantenha `status`, `groups` e `error` explícitos para que qualquer renderer
  possa tratar carregamento, vazio e falha;
- `error` deve ser seguro e voltado ao consumidor, sem headers, credenciais ou
  conteúdo sensível;
- links e identificadores devem ser placeholders neste exemplo;
- a view pode derivar detalhes visuais, mas não deve reimplementar a consulta ou
  a regra de agrupamento do domínio.

## Limitações

Este host não valida:

- autenticação, permissões, digest, ETags ou comportamento de um tenant;
- CORS, CSP, cache, throttling, latência ou disponibilidade de rede;
- renderização, acessibilidade visual, responsividade ou interação real;
- compatibilidade entre versões de React, React DOM, bundlers ou SSR;
- publicação de assets ou integração com uma página SharePoint;
- segurança de uma aplicação que coloque regras críticas somente no frontend.

O SPMIDDLE continua usando a identidade e as permissões do usuário quando
executado no navegador. O host compatível não cria autorização adicional nem
protege segredos no cliente.

## Não é uma aplicação React real

Um host compatível com React não é um projeto React. Ele não contém componentes,
JSX, hooks, renderer, roteador, build de frontend ou bundle de produção. Para
criar uma aplicação React real, o consumidor deve escolher sua ferramenta,
instalar React no projeto da UI, definir componentes e testar a montagem no
ambiente correspondente. O view-model deste exemplo pode ser um contrato de
entrada, não uma aplicação pronta.

## Não é migração do `mse-platform`

Este exemplo também não é uma migração do `mse-platform`. Ele não altera módulos,
não substitui serviços legados, não prova equivalência visual ou operacional e
não autoriza publicação. Reutilizar um contrato demonstra somente
compatibilidade estrutural local.

Uma migração real exigiria inventário de consumidores, versionamento e decisão
de compatibilidade, revisão de segurança, testes com autenticação e permissões
reais, validação no destino de produção autorizado, verificação de publicação e
plano de rollback. Nenhuma dessas etapas é executada por este host.

**Significado de uma execução verde:** o host fake e o contrato serializável
passaram localmente — não que uma aplicação React exista, nem que o
`mse-platform` tenha sido migrado.
