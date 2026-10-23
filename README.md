# SPMIDDLE

> Middleware JavaScript client-side para aplicações que utilizam o SharePoint
> como infraestrutura de persistência e consulta.

O SPMIDDLE inicialmente será executado no navegador e usará a sessão e as
permissões do usuário corrente para acessar o SharePoint. O projeto não terá um
backend próprio nem um ORM completo na primeira fase.

A diretriz e o planejamento completos estão em
[`PLANO-SPMIDDLE.md`](PLANO-SPMIDDLE.md).

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

## Escopo futuro

Backend próprio, Microsoft Graph, processamento assíncrono e outras capacidades
mais complexas serão avaliados somente quando houver uma necessidade concreta.
