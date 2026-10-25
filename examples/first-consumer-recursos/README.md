# Spike de compatibilidade — primeiro consumidor Recursos (encerrado no CAMAP)

Este diretório documenta o spike de compatibilidade do primeiro consumidor do
SPMIDDLE: o módulo **Explore Mais** (`mod_recursos`) do `mse-platform`. O spike
é deliberadamente pequeno e local. Ele registra o contrato que precisa ser
preservado e a composição que deverá ser exercitada antes de uma migração real;
não é ainda uma migração do módulo nem uma alteração no `mse-platform`.

> **Decisão operacional:** Explore Mais não é um módulo válido para o site CAMAP.
> O spike permanece como referência local de contrato e não deve ser publicado
> ou reativado nesse site. A lista técnica temporária `RecursosLinks` foi removida
> após a validação.

## Objetivo e escopo

O objetivo é provar que o caso de leitura do Explore Mais pode ser composto
sobre contratos do SPMIDDLE sem levar para o middleware regras de UI, roteamento,
tema ou conhecimento específico do host. O escopo desta primeira verificação é:

- declarar um schema equivalente, apenas como referência do contrato;
- registrar uma fonte lógica `recursos-links` em um site server-relative fictício;
- consultar links ativos com seleção e ordenação equivalentes às atuais;
- mapear os itens crus para grupos por categoria;
- executar a composição contra transporte e estado em memória;
- identificar lacunas antes de conectar qualquer tenant ou asset publicado.

Ficam fora do escopo do spike a tela, busca local, filtros, alternância de
visualização, resumo da Home, provisionamento em ambiente real, publicação,
autenticação e qualquer mudança no código ou nos contratos do `mse-platform`.

## Contrato legado a preservar

O consumidor atual usa a fonte lógica `recursos-links`, embora a lista física
tenha o nome histórico `RecursosLinks`. O serviço de leitura existente obtém
`dataSources.get("recursos-links")` e chama o cliente da fonte com:

```javascript
{
  select: [
    "Id", "Title", "URL", "Categoria", "Descricao",
    "IconeChave", "Ordem", "AbrirNovaJanela"
  ],
  filter: "Ativo eq 1",
  orderBy: "Categoria asc,Ordem asc,Title asc",
  top: 500
}
```

O resultado público do serviço é `listGroupedLinks()`, que agrupa os itens por
`Categoria` e usa `Outros` quando a categoria está ausente:

```javascript
[
  {
    category: "Power Platform",
    links: [
      {
        Id: 1,
        Title: "<placeholder-title>",
        URL: "<placeholder-url>",
        Categoria: "Power Platform",
        Descricao: "<placeholder-description>",
        IconeChave: "<placeholder-icon>",
        Ordem: 10,
        AbrirNovaJanela: true
      }
    ]
  }
]
```

O contrato do schema legado é versão 3, com a lista `RecursosLinks` e os
campos `URL`, `Categoria`, `Descricao`, `IconeChave`, `Ordem`,
`AbrirNovaJanela` e `Ativo`, além do título. As categorias são dados de
curadoria do consumidor, não uma responsabilidade automática do SPMIDDLE.
Identificadores reais, URLs reais, GUIDs e conteúdo corporativo não pertencem a
este exemplo.

## Composição proposta no SPMIDDLE

A composição mantém a separação entre infraestrutura e domínio:

```text
Explore Mais (caso de uso e UI do mse-platform)
        |
        | fonte lógica: recursos-links
        v
SPMIDDLE: registro de fontes + cliente SharePoint + query
        |
        v
transporte SharePoint REST (fake neste spike)
        |
        v
estado em memória com itens RecursosLinks
```

Uma implementação futura do adaptador poderá ser equivalente a:

```javascript
const source = registry.get("recursos-links");
const client = registry.getListClient("recursos-links");

const items = await client.getListItems(source, {
  select: [
    "Id", "Title", "URL", "Categoria", "Descricao",
    "IconeChave", "Ordem", "AbrirNovaJanela"
  ],
  filter: { field: "Ativo", operator: "eq", value: 1 },
  orderBy: [
    { field: "Categoria", direction: "asc" },
    { field: "Ordem", direction: "asc" },
    { field: "Title", direction: "asc" }
  ],
  pageSize: 500
});
```

O mapper/serviço do consumidor continua responsável por converter o resultado
em grupos e por decidir como a UI apresenta os links. O SPMIDDLE não deve
conhecer `Explore Mais`, `recursos`, componentes, CSS, menus ou regras de
curadoria. Durante a transição, uma fachada pode preservar o nome legado
`recursos-links` enquanto o namespace público do módulo permanece
`explore-mais`.

## Execução local com fake

O spike deve usar exclusivamente um transporte em memória, sem DNS, HTTP,
navegador, sessão, tenant ou credenciais. Os valores abaixo são placeholders
intencionais:

```javascript
const webUrl = "/sites/<site-name>";
const listTitle = "<list-title>";
const sourceKey = "recursos-links";
```

Para validar a fundação local já disponível no SPMIDDLE, execute na raiz do
projeto:

```powershell
npm test
node examples/integrated-local/app.js
```

O teste de paridade local do contrato legado pode ser executado isoladamente:

```powershell
node examples/first-consumer-recursos/parity.test.js
```

Ele usa uma projeção comportamental sanitizada do serviço legado e um transporte
fake. Não importa nem altera o `mse-platform` e não comprova equivalência em um
tenant SharePoint real.

A paridade declarativa do schema pode ser executada com:

```powershell
node examples/first-consumer-recursos/schema-parity.test.js
```

Esse teste compara identidade, versão, campos, defaults e índices usando um
contrato legado sanitizado. As diferenças de tipo entre `URL` e `Categoria` são
asserções explícitas e não são tratadas como equivalência acidental.

A verificação dos guardrails de segurança pode ser executada com:

```powershell
node examples/first-consumer-recursos/security-parity.test.js
```

Ela cobre URLs HTTP(S) seguras, rejeição de esquemas ativos, remoção de conteúdo
executável em descrições e limites básicos de conteúdo. O teste não acessa as
URLs; todos os hosts são placeholders.

O exemplo integrado existente demonstra `inspect`, `apply`, `verify` e CRUD
com ETag usando memória. Para este spike, a execução equivalente deve semear
somente itens fictícios de `RecursosLinks`, aplicar o filtro de ativos, ordenar
por categoria/ordem/título e verificar o agrupamento. Uma saída bem-sucedida
prova apenas que a composição e o contrato local funcionam; não prova
permissão, digest, schema ou comportamento de um SharePoint real.

Não substitua o fake por URL corporativa, token, cookie, GUID ou dados reais.
Qualquer validação externa é uma etapa operacional separada, autorizada e
documentada pelo responsável pelo ambiente.

## Placeholders e limites do resultado

Este README usa placeholders para todos os valores dependentes de ambiente e de
conteúdo. O spike não cria listas, não aplica schema em tenant, não publica
assets e não altera arquivos do `mse-platform`. Em particular, ele não deve:

- editar `modules/mod_recursos` ou seus testes;
- trocar o serviço legado em produção;
- assumir que `RecursosLinks` existe ou que o schema está compatível;
- converter automaticamente o filtro textual legado em comportamento de
  autorização;
- tratar a passagem dos testes fake como integração real.

## O que ainda falta antes da migração real

1. Fechar e versionar o contrato público do SPMIDDLE para fontes, query,
   paginação, mapper e erros.
2. Confirmar no SharePoint real a representação do campo `Ativo`; no tenant
   validado, `Ativo eq 1` retorna os registros ativos, enquanto `Ativo eq true`
   retorna o conjunto incorreto. O adaptador usa `1` na consulta e normaliza
   `1`/`true` na resposta para preservar compatibilidade entre transportes.
3. Cobrir paginação, respostas vazias, throttling e limites; `top: 500` não deve
   ocultar a necessidade de cursor quando houver mais itens.
4. Comparar, com fixtures controladas, o agrupamento e a ordenação do serviço
   atual com o adaptador SPMIDDLE, incluindo `Ativo` como `1`/`true`, categoria
   ausente, categorias desconhecidas e campos opcionais.
5. Validar schema versão 3, nomes internos, índices, permissões de leitura e
   a identidade física da lista em destino autorizado, sem provisionar por
   carregamento normal.
6. Definir a fachada de compatibilidade e o plano de rollback para que o
   Explore Mais possa alternar entre o serviço legado e o SPMIDDLE sem mudança
   de comportamento visível.
7. Executar testes de contrato e uma integração real somente com sessão,
   destino e dados autorizados, incluindo evidência de permissões e digest.
8. Só então preparar a migração incremental do consumidor; até esse aceite, o
   `mse-platform` permanece a fonte de comportamento e não recebe alterações.

**Status:** spike documental/local encerrado como candidato do CAMAP; não aprovado
para migração ou publicação. O contrato pode ser reutilizado somente após a
aprovação de outro consumidor e destino válidos.
