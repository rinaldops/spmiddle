# SPMIDDLE

> Middleware JavaScript client-side para aplicações que utilizam o SharePoint
> como infraestrutura de persistência e consulta.

O SPMIDDLE inicialmente será executado no navegador e usará a sessão e as
permissões do usuário corrente para acessar o SharePoint. O projeto não terá um
backend próprio nem um ORM completo na primeira fase.

A diretriz e o planejamento completos estão em
[`PLANO-SPMIDDLE.md`](PLANO-SPMIDDLE.md).

## Estado do desenvolvimento

O primeiro incremento implementa o transporte REST independente em
`packages/sharepoint-rest-browser`. Ele ainda não é o cliente completo de listas
nem substitui o `mse-platform`.

```powershell
npm test
```

O pacote de transporte não depende de bibliotecas externas, DOM, Modern Script
Editor ou Site Kernel. O acesso a um tenant real não faz parte da suíte local;
os testes usam um transporte HTTP simulado.

## Limites de segurança

O SPMIDDLE executado no navegador usa a identidade e as permissões do usuário
corrente. Ele não fornece autenticação privilegiada, não protege segredos no
frontend e não transforma a interface em uma camada de autorização. Consulte
[`SECURITY.md`](SECURITY.md) antes de integrar o projeto.

## Objetivos iniciais

- cliente SharePoint REST reutilizável;
- CRUD de itens;
- paginação e consultas tipadas;
- ETags e concorrência;
- schemas declarativos;
- provisionamento administrativo `inspect/apply/verify`;
- repositories e mappers;
- tratamento de erros e throttling;
- upload de arquivos;
- integração incremental com o `mse-platform`.

O primeiro spike de consumidor está em
[`examples/first-consumer-recursos/`](examples/first-consumer-recursos/). Ele
valida localmente a compatibilidade do contrato de leitura do Explore Mais sem
alterar o repositório `mse-platform` e sem acessar um tenant real.

O plano formal para uma integração futura, ainda sem migração autorizada, está
em [`docs/INTEGRATION-MSE-PLATFORM.md`](docs/INTEGRATION-MSE-PLATFORM.md).

A diretriz para manter o container MSE vivo e evitar reload completo da página
em ações internas está em
[`docs/INCREMENTAL-HOST-UPDATES.md`](docs/INCREMENTAL-HOST-UPDATES.md).

## Escopo futuro

Backend próprio, Microsoft Graph, processamento assíncrono e outras capacidades
mais complexas serão avaliados somente quando houver uma necessidade concreta.
