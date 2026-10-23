# Exemplo integrado local

Este diretório documenta a execução local de uma integração do cliente REST do
SPMIDDLE usando um transporte HTTP falso (fake). O exemplo é intencionalmente
offline: não abre navegador, não acessa tenant e não depende de sessão,
credenciais ou dados de SharePoint.

## Pré-requisitos

- Node.js `>= 20`;
- uma cópia local do repositório;
- dependências do projeto instaladas, se o ambiente exigir instalação para os
  testes locais.

Não configure URL real, token, cookie, certificado ou qualquer outro segredo
para executar este exemplo. Use somente valores fictícios, como
`<site-server-relative>` e `<list-title>`.

## Como executar

A partir da raiz do repositório:

```powershell
npm test
```

Para executar o fluxo integrado local deste diretório:

```powershell
node examples/integrated-local/app.js
```

O script executa `inspect`, `apply`, `verify` e operações de criação, leitura,
atualização e exclusão usando um transporte em memória. Para executar
diretamente apenas o contrato de transporte:

```powershell
npm --prefix packages/sharepoint-rest-browser run test:contract
```

Também é possível executar a suíte do pacote inteira:

```powershell
npm --prefix packages/sharepoint-rest-browser test
```

O script e os testes usam transportes falsos que respondem às requisições com
dados controlados. O `webUrl` usado pelos cenários deve ser sempre um caminho
server-relative fictício, por exemplo `/sites/<site-name>`; substitua
`<site-name>` apenas por outro identificador de teste local, nunca por um
endereço corporativo. O nome da lista e os itens também são placeholders de
teste, não dados reais.

## O que o exemplo prova

O fluxo integrado com transporte em memória permite verificar, de forma
determinística, que a camada de dados:

- aceita e normaliza um `webUrl` server-relative;
- monta caminhos `/_api/...` relativos ao site configurado;
- envia o cabeçalho `Accept` esperado;
- obtém e reutiliza um request digest nas operações de escrita;
- traduz `MERGE` e `DELETE` para `POST` com os cabeçalhos REST apropriados;
- exige ETag explícita para alterações e exclusões, salvo opt-in explícito para
  wildcard;
- repete leituras limitadas quando recebe respostas de throttling com
  `Retry-After`;
- não repete escritas automaticamente;
- expõe erros tipados, incluindo acesso negado, throttling e conflito de
  concorrência;
- cria e inspeciona uma lista fictícia;
- aplica e verifica um schema fictício;
- cria, lista, atualiza e exclui item com controle de ETag.

A suíte do pacote também verifica respostas JSON, vazias e binárias, além dos
casos de throttling e erros tipados.

Em outras palavras, o exemplo comprova a integração entre a fábrica do cliente,
o contrato de transporte e a implementação fake de `fetch`. Ele não comprova
que uma requisição chegaria ao SharePoint, que a identidade teria permissões,
que o digest seria aceito por um serviço real ou que uma lista existiria.

## Transporte falso versus integração real

### Transporte falso (este exemplo)

- executa somente em processo local;
- não faz DNS, conexão HTTP, autenticação nem chamada externa;
- devolve respostas programadas ou mantém estado em memória para exercitar
  sucesso e falhas;
- valida o comportamento do cliente e o formato das requisições;
- não requer navegador ou tenant access.

### Integração real com SharePoint

Uma integração real é uma etapa separada e precisa de um ambiente autorizado,
uma sessão autenticada e um `webUrl` server-relative correspondente ao site
real. Ela deve ser validada somente pelo fluxo operacional apropriado, com
permissões, políticas de rede, listas e dados definidos pelo responsável pelo
ambiente. Essa validação não é realizada por este exemplo e não deve ser
simulada trocando o fake por uma URL real neste README ou nos testes locais.

Portanto, uma execução bem-sucedida aqui significa **"o contrato local do
cliente passou"**, e não **"a integração com SharePoint está validada"**.

## Limites e segurança

Não inclua neste diretório URLs corporativas, GUIDs, dados pessoais, tokens,
cookies ou certificados. Mantenha os placeholders genéricos e preserve a
separação entre testes offline e qualquer validação autorizada de produção.
