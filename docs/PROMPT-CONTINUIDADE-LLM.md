# Prompt de continuidade para outra LLM

Você dará continuidade ao trabalho de integração do SPMIDDLE com a página
SharePoint `Preview.aspx`. Leia primeiro, nesta ordem:

1. `C:\PROJETOS\VSTO\AGENTS.md`;
2. `C:\PROJETOS\VSTO\AI_CONTEXT.md`;
3. `C:\PROJETOS\VSTO\web-devs\AGENTS.md`;
4. `C:\PROJETOS\VSTO\web-devs\AI_CONTEXT.md`;
5. este arquivo;
6. `SPMIDDLE/README.md`;
7. `SPMIDDLE/docs/ASPX-INCREMENTAL-VALIDATION-RUNBOOK.md`;
8. `SPMIDDLE/docs/INCREMENTAL-HOST-UPDATES.md`;
9. `SPMIDDLE/docs/INTEGRATION-MSE-PLATFORM.md`.

## Objetivo atual

Manter e evoluir com segurança o host incremental SPMIDDLE publicado na página:

```text
https://petrobrasbr.sharepoint.com/teams/camap-agp/SitePages/Preview.aspx
```

A integração deve permanecer somente leitura. Não alterar nem migrar o
`mse-platform`.

## Estado publicado confirmado

A página está usando o runtime:

```text
/teams/camap-agp/SiteAssets/spmiddle/preview/2026-10-25-camap-readonly-v8/mse-preview-camap-readonly-runtime.js
```

O runtime `v8` está funcionando e foi validado na página publicada:

```text
27 publicações carregadas
rootMounts=1
fullReloads=0
internalNavigations=0
```

Funcionalidades atuais:

- consulta REST somente GET;
- limite de 50 registros;
- campos consultados: `Id`, `Title`, `CategoriaTexto`,
  `EstadoEditorial`, `DataPublicacao`;
- busca por título;
- filtro dinâmico por categoria;
- filtro dinâmico por estado editorial;
- ordenação por data: mais recentes/mais antigas;
- datas sem valor ficam no final em ambas as ordenações;
- exibição com escape HTML;
- botão de atualização bloqueado explicitamente por modo somente leitura;
- fallback externo sem navegação automática;
- métricas de montagem, reload, navegação e região afetada.

Fonte SharePoint:

```text
Site: /teams/camap-agp
Lista visível: MSE Publicacoes
Nome interno da pasta/lista na URL: CAMAPPublicacoes
```

Endpoint usado pelo runtime:

```text
/teams/camap-agp/_api/web/lists/getbytitle('MSE Publicacoes')/items
```

Não trocar `MSE Publicacoes` por `CAMAPPublicacoes`: o primeiro é o título
visível aceito por `getbytitle`; o segundo é o segmento da URL e causou erro no
passado.

Valores atualmente observados:

- `CategoriaTexto`: `Boletim`, `Conhecimento`, `Docs e padrões`, `Iniciativas`,
  `Institucional`, `Serviços e processos`;
- `EstadoEditorial`: `Publicado`;
- `DataPublicacao`: valores ISO do SharePoint, por exemplo
  `2026-10-28T03:00:00Z`.

## Arquivos principais

Runtime:

```text
SPMIDDLE/examples/incremental-mse-host/mse-preview-camap-readonly-runtime.js
```

Snippet completo usado pelo MSE:

```text
SPMIDDLE/examples/incremental-mse-host/mse-preview-snippet.html
```

O snippet local deve apontar para o asset remoto atualmente publicado em `v8`.
Não alterar o `mse-platform` e não inserir JavaScript inline como solução: o
Modern Script Editor renderiza o HTML, mas não executa o JavaScript inline.

## Regra operacional solicitada pelo usuário sobre SiteAssets

O usuário determinou que não sejam criadas novas versões/pastas em `SiteAssets`.
O único versionamento desejado pelo usuário é via commits Git. A intenção
operacional é manter uma única pasta/asset publicado e atualizá-lo com o mesmo
caminho, usando refresh profundo quando necessário.

Quando o overwrite for efetivamente permitido:

1. mantenha o mesmo caminho remoto `.../preview/v8/...`;
2. publique o arquivo no mesmo local, sem criar `v9`, `v10` etc.;
3. registre a alteração em commit;
4. faça push somente se isso estiver no escopo autorizado;
5. solicite ao usuário refresh profundo (`Ctrl+Shift+R` no Edge/Windows; se
   necessário, `Ctrl+F5`);
6. valide novamente o asset, o carregamento e as métricas.

Não prometa rollback remoto se o histórico/versionamento nativo do SharePoint
ou os assets anteriores não estiverem disponíveis. O rollback por commit só
reverte o código-fonte; ele não restaura automaticamente um arquivo remoto já
sobrescrito.

## Regras de segurança e escopo

- Trabalhar somente no destino de produção já autorizado nesta sessão.
- Não publicar senhas, tokens, cookies, certificados, GUIDs desnecessários ou
  dados pessoais.
- Não registrar HTML bruto, respostas REST completas, cookies ou estado de
  autenticação no repositório.
- Usar somente leitura para a lista, sem criar, editar ou excluir itens.
- Não carregar `CorpoHtmlSeguroV1`, imagens, autoria ou conteúdo editorial amplo
  sem uma decisão específica e um contrato sanitizado.
- Não inventar links: `LinkExterno` foi inspecionado e contém texto editorial,
  não uma URL confiável; `Slug` é apenas um identificador. Rotas presumidas de
  publicação retornaram `404`.
- Não usar Selenium, Playwright avulso, CDP direto ou navegador genérico.
- Toda manipulação SharePoint deve usar `app-devs/FIORI-AUTO`, com sessão
  autenticada apropriada e sem expor dados de sessão.
- Preservar o host incremental: ações internas devem atualizar somente a região
  afetada, sem reload completo ou navegação interna.

## Procedimento para qualquer próximo incremento

1. Inspecionar o estado local e o Git antes de editar.
2. Confirmar o contrato do campo SharePoint por consulta somente leitura; nunca
   presumir nome interno ou formato.
3. Alterar primeiro o arquivo local do runtime/snippet.
4. Executar:

   ```powershell
   node --check examples/incremental-mse-host/mse-preview-camap-readonly-runtime.js
   npm test
   git diff --check
   ```

5. Validar segurança, escape HTML, acessibilidade básica, estado vazio e erro.
6. Publicar somente se a publicação estiver autorizada e tecnicamente
   permitida pelas regras efetivas.
7. Confirmar MIME `application/javascript`, caminho, conteúdo e cache.
8. Registrar a mudança em commit com mensagem objetiva.
9. Solicitar refresh profundo quando houver alteração do asset remoto.
10. Validar na `Preview.aspx` com FIORI-AUTO.

## Critérios de aceite no navegador

Para cada ação interna, confirmar:

```text
rootMounts=1
fullReloads=0
internalNavigations=0
```

Também verificar:

- exatamente uma raiz `[data-spmiddle-mse-root]`;
- asset esperado presente;
- leitura concluída sem erro;
- região de itens atualizada;
- filtros e ordenação coerentes com os dados exibidos;
- estado somente leitura preservado;
- fallback não executa navegação automática.

## Histórico relevante de commits

Commits mais recentes relacionados ao host:

```text
51647f8 fix: keep undated publications last
84d9d2b feat: add publication date sorting to preview
eb5dc41 feat: add editorial status filtering to preview
50e3a24 fix: derive preview category options from data
d987318 feat: add category filtering to CAMAP preview
87843ff fix: use visible CAMAP publications list title
```

O estado local deve ser conferido com `git status` e `git log`; não descartar
alterações de terceiros.

## Próximo trabalho recomendado

Não adicionar novas funcionalidades automaticamente sem uma solicitação clara.
O próximo passo seguro, se solicitado, é revisar a experiência do host e seus
testes locais, especialmente:

- confirmar que a ordenação de registros sem data continua no final;
- adicionar testes locais específicos para filtros combinados e ordenação;
- revisar acessibilidade dos três seletores e mensagens de status;
- medir cache/refresh profundo quando o mesmo asset for sobrescrito;
- manter a integração somente leitura.

Ao responder ao usuário, diferencie sempre:

- o que foi alterado localmente;
- o que foi commitado;
- o que foi publicado remotamente;
- o que foi validado na página real;
- qualquer bloqueio de permissão ou política.
