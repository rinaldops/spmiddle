# Plano de integração futura com o `mse-platform`

## Status e propósito

**Status:** fundação e piloto técnico CAMAP concluídos; nenhuma migração de
módulo do `mse-platform` autorizada ou executada.

Este documento define as condições para avaliar uma integração futura entre o
SPMIDDLE e o `mse-platform`. Ele não autoriza alterações no repositório do
consumidor, publicação em SharePoint, acesso a tenant, cópia de dados
corporativos ou substituição do `core` existente.

### Estado atual — outubro de 2026

- o SPMIDDLE REST/domain baseline está publicado em `main` no commit `83183d6`;
- o host CAMAP somente leitura foi validado na `Preview.aspx` sem reload ou
  navegação interna;
- o Explore Mais foi encerrado como candidato para o site CAMAP, pois não é um
  módulo válido desse site;
- a lista técnica temporária `RecursosLinks` foi removida;
- o `mse-platform` continua sem alterações.

Assim, o próximo piloto precisa de outro consumidor explicitamente válido e
aprovado. Este documento não autoriza reativar o Explore Mais no CAMAP.

O objetivo é permitir uma decisão reversível e baseada em evidências: primeiro
provar compatibilidade em ambiente local com placeholders; depois, somente se
houver autorização específica, executar um piloto controlado em produção.

## Princípios

- O `mse-platform` é consumidor de referência, não parte do núcleo do SPMIDDLE.
- O SPMIDDLE deve permanecer independente de MSE, Site Kernel, Joomla!, DOM e
  componentes de apresentação.
- Nenhum código é copiado sem proveniência, licença e revisão de dependências.
- O transporte real continua sujeito à sessão, permissões, ETags, digest,
  throttling e políticas do SharePoint.
- Uma página ASPX já carregada deve manter o container MSE vivo: ações internas
  devem atualizar somente dados, estado ou layout afetados, sem reload completo.
- A migração deve ser incremental, observável e reversível; não substituir todo
  o `core` em uma única alteração.
- Dados de tenant, URLs, GUIDs, cookies, tokens e evidências operacionais ficam
  fora do repositório público.

## Critérios de entrada

O inventário inicial sanitizado e a matriz de contratos estão em
[`MSE-PLATFORM-INVENTORY.md`](MSE-PLATFORM-INVENTORY.md). Ele é uma entrada de
planejamento, não uma autorização para alterar o consumidor.

Antes de qualquer piloto, devem existir:

1. inventário aprovado dos consumidores e fluxos afetados;
2. mapa de dependências entre `mse-platform/core`, módulos, hosts e SPMIDDLE;
3. matriz de equivalência de contratos, incluindo diferenças intencionais;
4. decisão de compatibilidade e versionamento para cada consumidor;
5. verificação de licença e proveniência para qualquer extração de código;
6. matriz de permissões e operações SharePoint necessárias;
7. plano de observabilidade, regressão e rollback;
8. autorização explícita para o destino de produção e para cada alteração.

Sem esses artefatos, a atividade deve permanecer em análise local.

## Fases propostas

### Fase 0 — Baseline congelado

- preservar o `mse-platform` sem alterações;
- registrar a versão do SPMIDDLE e do consumidor analisado;
- executar a suíte local completa;
- confirmar que todos os exemplos usam fake transport e placeholders;
- definir o comportamento atual que não pode regredir.

**Saída:** baseline reproduzível e relatório de escopo, sem dados corporativos.

### Fase 1 — Inventário e proveniência

- listar consumidores, pontos de entrada e contratos de dados;
- separar infraestrutura reutilizável de regras específicas de módulo;
- identificar referências candidatas no `core` sem copiar conteúdo automaticamente;
- registrar origem, licença, autoria, versão e transformação prevista;
- classificar itens como `extrair`, `adaptar`, `manter no consumidor` ou
  `descartar`.

**Gate:** nenhum item pode entrar no SPMIDDLE sem proveniência e revisão.

### Fase 2 — Matriz de contratos

Comparar, por fluxo, os contratos atuais e os do SPMIDDLE:

| Área | Verificação mínima |
| --- | --- |
| REST | método, caminho, headers, respostas vazias e erros |
| Concorrência | ETag exata, conflitos e comportamento de retry |
| Consulta | campos permitidos, filtros, ordenação e paginação |
| Dados | schema, mapper, defaults, campos somente leitura |
| Segurança | allowlist, sanitização, limites e redaction |
| Arquivos | MIME, tamanho, traversal, upload e download |
| Provisionamento | inspect/apply/verify e confirmação administrativa |
| Apresentação | contrato de domínio separado do host e da UI |

**Gate:** toda diferença deve ser classificada como compatível, adaptável,
quebra intencional ou bloqueio.

### Fase 3 — Adaptador de compatibilidade

- criar uma fachada no consumidor, sem alterar seu comportamento padrão;
- direcionar apenas um fluxo pequeno e somente em fake transport;
- manter o caminho legado selecionável;
- comparar saída normalizada, erros e chamadas REST esperadas;
- adicionar testes de contrato e regressão antes de qualquer uso real.

O contrato de leitura do Explore Mais foi o primeiro candidato conceitual e está
validado localmente pelo adaptador `first-consumer-recursos`, mas foi encerrado
como candidato do site CAMAP. Isso não constitui autorização para migrar o
módulo real nem autoriza sua reativação nesse site. Um novo piloto exige outro
consumidor explicitamente válido.

### Fase 4 — Piloto controlado

Somente após os gates anteriores e autorização operacional:

- selecionar um consumidor pequeno e uma fonte previamente aprovada;
- executar com permissões mínimas e sessão do usuário;
- preservar o caminho legado e uma forma de desligar o adaptador;
- observar erros, latência, throttling, permissões e divergências de dados;
- não provisionar nem alterar estruturas sem ação administrativa confirmada;
- registrar somente métricas e resultados sanitizados.

### Fase 5 — Decisão de expansão

Expandir apenas se os critérios de aceite forem atendidos. Caso contrário,
desligar o adaptador, restaurar o caminho legado e registrar a causa sem reescrever
histórico ou descartar evidências necessárias.

## Critérios de aceite do piloto

- suíte local e testes de contrato verdes;
- comportamento de leitura equivalente para casos válidos, vazios e inválidos;
- nenhum aumento não explicado de permissões necessárias;
- ETags, paginação, sanitização e limites preservados;
- ausência de retry automático em escritas;
- erros seguros, tipados e sem segredos;
- caminho legado permanece operacional;
- rollback exercitado ou demonstrado com evidência sanitizada;
- nenhuma alteração não planejada em listas, bibliotecas, SiteAssets ou módulos.

## Rollback

O rollback deve ser definido antes do piloto:

1. desligar a seleção do adaptador SPMIDDLE;
2. retornar ao caminho legado versionado;
3. preservar dados e versões SharePoint, sem exclusão automática;
4. verificar leitura pelo caminho legado e permissões do usuário;
5. registrar o motivo, o alcance e as evidências sanitizadas;
6. bloquear nova tentativa até revisão do gate que falhou.

Não usar reset destrutivo, exclusão ampla, reescrita de histórico Git ou
substituição silenciosa de assets publicados como mecanismo de rollback.

## Fora desta etapa

Este plano não executa:

- leitura ou escrita em tenant real;
- publicação de SiteAssets ou pacote SPFx;
- alteração no `mse-platform`;
- cópia de código corporativo para o repositório público;
- migração de módulos, listas ou configurações;
- decisão de permissões de produção.

As próximas ações permitidas sem autorização operacional adicional são apenas
refinar o inventário local, a matriz de contratos e os testes com fakes.
