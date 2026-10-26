# Migração Joomla-like para SPMIDDLE

**Branch:** `feature/migrate-spmiddle-joomla`  
**Status:** preparação de contrato; nenhuma lista, página ou asset foi alterado.

## Decisões inegociáveis

- O SPMIDDLE será a camada de infraestrutura SharePoint; o `mse-platform`
  permanecerá responsável por aplicação, componentes, módulos, templates,
  rotas e apresentação.
- Listas atuais do site CAMAP não serão reutilizadas nem renomeadas.
- As novas listas ficarão no subsite autorizado de dados do projeto, cujo
  caminho server-relative é mantido como configuração operacional fora deste
  repositório.
- A página MSE de desenvolvimento e validação continuará sendo a
  `Preview.aspx` do site principal; o fato de os dados estarem no subsite não
  muda o host de execução.
- Todo desenvolvimento novo seguirá as convenções Joomla originais.

## Convenção de persistência

O prefixo de instalação adotado é `mse`. Nomes de listas devem:

- começar com `mse`;
- usar o nome Joomla canônico, sem tradução para português;
- não conter espaços, acentos ou aliases adaptados;
- manter o mesmo nome lógico para título visível e nome interno sempre que o
  SharePoint permitir;
- ser definidos por contrato antes do provisioning.

Exemplos meramente ilustrativos:

```text
mseContent
mseCategories
mseTags
mseContentitemTagMap
mseExtensions
mseModules
mseModulesMenu
mseMenu
```

Os nomes finais devem ser derivados do schema Joomla correspondente, e não de
listas legadas como `MSE Publicacoes`, `MSEMenu` ou outras estruturas existentes.

## Regras de implementação

1. Criar o schema no SPMIDDLE com nomes internos Joomla-like em inglês.
2. Validar campos, tipos, defaults, índices e relações antes de escrever.
3. Provisionar somente no subsite de dados aprovado.
4. Usar `inspect/apply/verify`, confirmação administrativa e rollback definido.
5. Consumir os dados a partir do MSE da `Preview.aspx` usando configuração de
   fonte apontando para o subsite.
6. Manter o caminho atual funcional até o novo fluxo passar pelos gates.
7. Não publicar código ou configuração no `mse-platform` público que contenha
   URL corporativa, GUID, cookie, token ou dado de produção.

## Gates da primeira etapa

- inventário dos schemas Joomla originais;
- catálogo de listas e campos canônicos;
- matriz de relações e índices;
- contratos SPMIDDLE para leitura e escrita;
- plano de permissões do subsite;
- plano de rollback sem reutilizar listas atuais;
- teste local com fake transport;
- provisioning controlado somente depois da revisão do catálogo.

Nenhuma migração funcional é considerada iniciada até que o catálogo seja
aprovado e as listas novas tenham sido verificadas no subsite correto.
