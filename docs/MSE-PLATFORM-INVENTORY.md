# Inventário inicial do `mse-platform`

**Escopo:** análise local, somente leitura, realizada em outubro de 2026.
**Status:** referência para planejamento; não é autorização de migração.

Este inventário registra comportamentos e fronteiras observados no consumidor de
referência para orientar uma eventual integração com o SPMIDDLE. Foram usados
somente caminhos, símbolos e valores sanitizados. Não são registrados URLs de
tenant, GUIDs, cookies, tokens, dados pessoais ou evidências de produção.

## Estado da análise

Foram examinados:

- `core/rest.js`;
- `core/data-sources.js`;
- `core/list-provisioning.js`;
- `core/provisioning.js`;
- `core/rich-text.js`;
- `core/settings-migrations.js`;
- `modules/mod_recursos/` e seus testes.

O inventário não altera o `mse-platform`. Existem alterações locais independentes
em outros caminhos do consumidor; elas foram preservadas e não fazem parte desta
análise.

## Matriz inicial de contratos

| Área | Comportamento observado no consumidor | Correspondência no SPMIDDLE | Situação |
| --- | --- | --- | --- |
| REST | site server-relative, digest, CRUD, ETag, erros tipados e retry de GET | transporte REST, erros, digest, ETag e retry controlado | compatibilidade estrutural local |
| Consultas | seleção, filtro, ordenação, limite e paginação | query controlada, repository e `getAllPages` limitado | adaptador necessário |
| Fontes | chave lógica, allowlist por site e cliente reutilizado por site | registro de fontes com allowlist e clientes lazy | compatível com diferenças de configuração |
| Schemas | campos internos, choices, índices, versionamento e segurança | schemas imutáveis, `inspect/apply/verify` e índices | requer matriz de migração |
| Provisionamento | inspeção antes de escrever, digest, ETag e confirmação | provisioning administrativo separado do runtime | compatível conceitualmente |
| Rich text | sanitização baseada em DOM fornecido pelo host | sanitização conservadora sem DOM | diferença intencional; validar política |
| Migrações | passos sequenciais de configuração e versões | schema versionado e provisionamento declarativo | requer mapeamento por recurso |
| Módulos/UI | ciclo de vida, DOM, views, configurações e hosts MSE | fora do núcleo; hosts específicos | não migrar para o núcleo |

## Primeiro fluxo candidato: Explore Mais — encerrado no site CAMAP

O Explore Mais foi analisado como spike de compatibilidade, mas não é um módulo
válido para o site CAMAP. Nenhuma migração foi executada. A lista técnica
temporária `RecursosLinks` e seus fixtures de teste foram removidos do site, e
a `Preview.aspx` permanece somente com o runtime CAMAP.

### Contrato legado observado

O módulo `mod_recursos` expõe um serviço com `listGroupedLinks()` e lê a fonte
lógica `recursos-links`. A consulta seleciona:

```text
Id, Title, URL, Categoria, Descricao, IconeChave,
Ordem, AbrirNovaJanela
```

O fluxo filtra itens ativos, ordena por `Categoria`, `Ordem` e `Title`, agrupa
por categoria e usa `Outros` quando a categoria está vazia. O módulo visual ainda
aplica busca, filtro de categoria, ordenação alternativa, cartões/lista compacta
e uma visão resumida.

O schema observado da lista possui versão `3`, campos obrigatórios para URL,
categoria, abertura em nova janela e ativo, além de índices para categoria,
ordem e ativo. A configuração do módulo possui versão `2` e destino configurável
para o resumo.

### Correspondência local no SPMIDDLE

`examples/first-consumer-recursos/adapter.js` já implementa a fronteira de
leitura com:

- schema declarativo;
- mapper entre nomes de domínio e nomes SharePoint;
- repository;
- filtro controlado de ativos;
- ordenação controlada;
- agrupamento legado;
- sanitização de descrição e validação de URL;
- transporte injetado e fake transport nos testes.

Os hosts standalone, React-compatible e SPFx-compatible consomem essa mesma
fronteira sem duplicar a consulta.

### Resultado da paridade local

`examples/first-consumer-recursos/parity.test.js` compara uma projeção
comportamental sanitizada do serviço legado com a saída do adaptador SPMIDDLE.
O teste cobre filtro de ativos, ordenação, fallback `Outros`, forma dos links e
exclusão de itens inativos. Ele usa somente transporte fake e placeholders; não
importa o `mse-platform` nem prova equivalência em SharePoint real.

Resultado atual: a projeção local é equivalente para esse fluxo controlado. A
consulta enviada pelo SPMIDDLE é verificada separadamente e permanece tipada,
allowlisted e limitada.

O próximo gate é a paridade declarativa do schema. Ela deve comparar versão,
identidade da lista, campos obrigatórios, defaults e índices sem executar
provisionamento. A diferença conhecida é intencional: o schema legado descreve
`URL` como texto, enquanto o SPMIDDLE usa o tipo `URL` para aplicar validação
mais explícita. Isso precisa ser confirmado como compatível antes de qualquer
uso real.

`examples/first-consumer-recursos/schema-parity.test.js` também registra as
diferenças de representação de `URL`, `Categoria` e `Descricao` como exceções
explícitas, além de verificar os campos comuns, defaults e índices. O teste é
local, não importa o consumidor e não executa provisioning.

### Diferenças que ainda exigem decisão

1. O consumidor legado usa o filtro textual `Ativo eq 1`. A validação real no
   tenant confirmou que `Ativo eq 1` retorna os registros ativos, enquanto
   `Ativo eq true` produz resultado incorreto para esse campo. O adaptador usa
   `1` na consulta e aceita `true`/`1` na resposta para manter compatibilidade
   entre transportes.
2. O consumidor visual aceita filtragem, busca e modos de apresentação em
   memória; isso permanece responsabilidade do host/UI, não do middleware.
3. O consumidor possui caminhos antigos de loader e provisionamento versionado;
   não devem ser tratados como contrato do núcleo sem revisão de release.
4. O consumidor aceita categorias fixas e também pode receber categorias
   desconhecidas. A política local é preservá-las como grupos distintos; somente
   categoria vazia ou ausente usa `Outros`. A política de exibição visual ainda
   deve ser definida antes de qualquer migração.
5. A política de URLs do SPMIDDLE é mais explícita e restritiva; registros
   existentes devem ser auditados antes de habilitar um adaptador real.

`examples/first-consumer-recursos/security-parity.test.js` cobre localmente a
decisão de segurança: URLs HTTP(S) sem credenciais são aceitas, esquemas ativos
e URLs ambíguas são rejeitados, rich text executável é removido e limites de
conteúdo são aplicados. Isso valida a política do adaptador, não a segurança de
dados já existentes no SharePoint.

## Dependências e candidatos de extração

### Candidatos reutilizáveis, após revisão

- transporte REST e normalização de respostas;
- registro de fontes;
- schemas declarativos;
- repositories/mappers;
- sanitização e limites;
- testes com transportes fakes.

### Permanecem no consumidor

- `kernel`, roteamento, layout, posições e dispatcher;
- módulos de interface, templates, temas e menus;
- views DOM e ciclo de vida visual;
- regras específicas de Fórum, Videoteca, Recursos e Home;
- loaders, snippets e empacotamento MSE.

Nenhum código deve ser copiado para o SPMIDDLE apenas por ter comportamento
semelhante. Cada extração futura precisa de proveniência, licença, contrato
independente e testes próprios.

## Riscos registrados

- provisioning pode deixar mudanças parciais se uma etapa posterior falhar;
- há responsabilidades de provisioning sobrepostas no consumidor;
- `$batch` depende da ordem das respostas e exige tratamento individual de erros;
- rich text depende do DOM fornecido pelo host no consumidor;
- URLs de links são dados de navegação e precisam da política explícita do
  SPMIDDLE;
- loaders e scripts de provisionamento antigos podem divergir da versão atual;
- testes locais não comprovam permissões, publicação, acessibilidade ou
  comportamento de tenant real.

## Próximo gate

Para um novo consumidor, antes de qualquer alteração no `mse-platform` ou acesso
externo, ainda faltam:

1. identificar e aprovar um fluxo e consumidor que sejam válidos para o destino;
2. fechar a matriz de equivalência do Explore Mais;
3. revisar proveniência/licença de qualquer código candidato;
4. definir permissões, observabilidade e rollback;
5. manter o caminho legado selecionável;
6. obter autorização operacional específica para produção.

O Explore Mais não deve ser usado como consumidor do site CAMAP. Até que outro
consumidor seja aprovado, a atividade permanece na fundação do SPMIDDLE, no
runtime CAMAP somente leitura e em testes locais com placeholders e transportes
fakes.
