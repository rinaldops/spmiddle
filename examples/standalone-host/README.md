# Host JavaScript standalone

Este exemplo mostra como executar um host JavaScript mínimo fora do navegador e
sem um tenant SharePoint. O host monta uma fonte fictícia, injeta um transporte
fake compatível com o cliente do SPMIDDLE, reutiliza o contrato de leitura
existente e transforma o resultado em um modelo de renderização serializável.

O exemplo é um harness local para validar as fronteiras entre host, contrato,
transporte e apresentação. Ele não é uma aplicação SharePoint publicada.

## Pré-requisitos

- Node.js `>= 20`;
- uma cópia local deste repositório;
- nenhum token, cookie, certificado, URL corporativa ou dado real.

Os cenários devem usar apenas placeholders, por exemplo:

```text
<site-server-relative>
<list-title>
<item-id>
<display-value>
```

## Como executar

A partir da raiz de `SPMIDDLE`, execute:

```powershell
node examples/standalone-host/app.js
```

O comando executa o host em processo local, imprime o resultado do fluxo e não
abre navegador nem faz chamadas de rede. Para executar a suíte geral do projeto:

```powershell
npm test
```

O host standalone é uma demonstração isolada; por isso, o comando do exemplo
pode ser executado independentemente da suíte principal. Se o entrypoint local
for renomeado, mantenha o comando apontando para o arquivo JavaScript do host
deste diretório, sem substituir o fake por um endpoint real.

## Fluxo do exemplo

O fluxo é deliberadamente pequeno:

1. o host define uma configuração de fonte usando `webUrl` server-relative e
   nomes fictícios;
2. o host injeta um `client` ou `transportFactory` com o método
   `request(path, options)`;
3. o serviço consulta a fonte pelo contrato reutilizado;
4. o resultado de domínio é convertido em um render model;
5. o host imprime JSON, em vez de depender de DOM, React, SharePoint ou CSS.

Uma execução bem-sucedida significa somente que esse fluxo local produziu o
modelo esperado.

## Transporte fake

O transporte fake implementa a mesma fronteira mínima esperada pelo consumidor:

```js
const transport = {
  webUrl: "/sites/<site-name>",
  async request(path, options = {}) {
    // Responder com dados programados; não chamar fetch nem a rede.
    return { data: { value: [] }, status: 200 };
  }
};
```

Na implementação do exemplo, o fake pode registrar as chamadas e devolver
respostas controladas para sucesso, lista vazia e erro. Isso permite verificar o
caminho REST relativo, o método HTTP, os parâmetros e o formato do retorno sem
simular autenticação. O fake não prova que uma requisição seria aceita por
SharePoint, nem que o usuário teria permissão.

Não troque `webUrl` por uma URL absoluta e não adicione headers com credenciais.
Qualquer estado mantido pelo fake deve permanecer em memória e conter apenas
placeholders.

## Reuso do contrato

O host não deve duplicar o contrato legado para adaptar cada resposta. Ele pode
reutilizar o adaptador/serviço de compatibilidade do exemplo
`first-consumer-recursos`, fornecendo a fonte e um transporte injetado:

```js
const service = createRecursosCompatibilityService({
  source: {
    webUrl: "/sites/<site-name>",
    listPath: "lists/getbytitle('<list-title>')/items"
  },
  client: transport
});
```

Também é possível fornecer `transportFactory` quando o host precisar criar o
transporte sob demanda. O contrato define a forma do dado de leitura e mantém
a separação entre nomes de domínio e nomes internos. O host standalone apenas
injeta dependências e consome o resultado; não altera o contrato para acomodar
o fake.

Essa reutilização demonstra compatibilidade estrutural. Ela não significa que o
host standalone seja uma migração, fork ou substituto do `mse-platform`.

## Render model

O render model é um objeto simples, estável e serializável, próprio para uma
camada de apresentação posterior. Um formato ilustrativo é:

```js
{
  type: "collection",
  title: "<list-title>",
  items: [
    {
      id: "<item-id>",
      label: "<display-value>",
      href: null
    }
  ],
  empty: false,
  error: null
}
```

O modelo não contém elementos DOM, instâncias de SharePoint, funções, tokens ou
dados de sessão. `href: null` deixa explícito que o exemplo não inventa uma URL
de navegação. Em caso de falha controlada, o host deve produzir um erro seguro
e observável, sem incluir headers, cookies ou conteúdo sensível na saída.

## Limitações

Este exemplo:

- não acessa SharePoint, `mse-platform` ou qualquer serviço externo;
- não autentica, não valida permissões e não reproduz cookies, digest ou ETags
  de um serviço real;
- não valida CORS, CSP, cache, throttling, latência ou comportamento de tenant;
- não testa DOM, acessibilidade visual, responsividade ou publicação;
- não transforma o render model em uma página pronta para produção;
- não substitui testes de integração autorizados nem a documentação operacional;
- não deve receber URLs, GUIDs, nomes de listas, dados pessoais ou evidências
  corporativas.

## Não confundir com migração real do `mse-platform`

O host standalone é uma prova local de composição JavaScript e reuso de
contrato. **Ele não é a migração do `mse-platform`, não altera seus módulos e
não comprova compatibilidade operacional com uma instalação existente.**

Uma migração real exigiria, separadamente, inventário dos consumidores,
decisão de compatibilidade e versionamento, revisão de segurança, validação do
ambiente de produção autorizado, testes com autenticação e permissões reais,
verificação de publicação e um plano de rollback. Nenhuma dessas etapas é
executada pelo comando acima.

Portanto, o significado de uma execução verde aqui é **“o host local e o
contrato fake passaram”**, e não **“a migração para o `mse-platform` foi
validada”**.
