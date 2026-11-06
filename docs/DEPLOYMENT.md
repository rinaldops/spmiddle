# Distribuição versionada do SPMIDDLE

## Gerar uma release independente

```powershell
npm test
npm run build:release
```

`scripts/build-release.js` gera `dist/<versão>/` (ignorado pelo Git), com os seis
pacotes de produção, adaptador MSE, metadados, licença e documentação. Os pacotes
mantêm suas versões individuais; a versão raiz identifica a distribuição
completa. O pacote `sharepoint-testing`, testes, exemplos de aplicação e assets
históricos CAMAP não fazem parte da distribuição runtime.

`release-manifest.json` registra caminho, tamanho e SHA-256 de cada arquivo.
Não contém credenciais, cookies ou dados de listas. Regere após qualquer mudança
nas fontes/documentação; nunca altere um manifest para aceitar bytes divergentes.

## Publicar

Uma publicação autorizada copia a árvore completa para uma pasta nova:

```text
<site-server-relative>/SiteAssets/spmiddle/releases/<versão>/
```

Preserve os caminhos relativos: os ES modules e o loader clássico usam imports
relativos à própria release. Não sobrescreva uma versão publicada, não copie
arquivos `.aspx` e não altere configuração de bibliotecas ou permissões para
viabilizar o upload. Se a biblioteca exigir checkout, aprovação ou versões
menores, conclua seu fluxo editorial antes de declarar os assets publicados.

Use o FIORI-AUTO obrigatório do workspace e uma sessão própria autenticada.
O uploader oficial `app-devs/FIORI-AUTO/dev-probe/sp_upload_local_files.py` aceita
`--check-target`, upload sem overwrite e `--verify-target` para comparação SHA-256.
Não use `--resume` em uma release existente divergente: essa opção sobrescreve
arquivos e não garante imutabilidade.

O helper de CLI `site_relative` do uploader deriva apenas `/teams/<site>` ou
`/sites/<site>`; em **subsites**, pode truncar o caminho. Confirme o web exato com
`/_api/web?$select=ServerRelativeUrl` e passe esse caminho completo às funções
oficiais de upload via RPC. Nunca suponha que `/teams/example/subsite` compartilha
o destino `SiteAssets` do pai.

## Ativar em um consumidor

Disponibilizar os assets **não migra automaticamente aplicações existentes**.
A publicação de uma release independente não troca imports embutidos em
MiniJoomla/mse-platform, nem muda snippets de páginas existentes.

O publicador conecta uma aplicação compatível ao host pelo snippet:

```html
<link rel="stylesheet" href="<site-server-relative>/SiteAssets/spmiddle/releases/0.2.0/host-adapters/modern-script-editor/layout.css">
<div data-spmiddle-host data-spmiddle-instance="my-app" data-spmiddle-layout="Contained">
  <div data-spmiddle-app-root></div>
</div>
<script src="<site-server-relative>/SiteAssets/spmiddle/releases/0.2.0/host-adapters/modern-script-editor/spmiddle-mse-host.js"></script>
<!-- Acrescente CSS e bootstrap externos da aplicação compatível. -->
```

Substitua `<site-server-relative>` pelo destino aprovado. O bootstrap aguarda
`SPMiddleMseHost.ready` e chama `applyMseLayout(host)` antes de montar a aplicação
pronta na raiz filha. O publicador pode então escolher `Contained` ou `FullBleed`
sem editar a aplicação. Consulte a [seção 17 do manual](CONSUMER-MANUAL.md#17-layout-de-publicação-no-modern-script-editor)
para contrato completo, cleanup e limitações.

## Verificar e reverter

- Verifique HTTP 200, bytes e SHA-256 de **todos** os arquivos, MIME executável
  de JavaScript, `text/css` do CSS e imports nativos sem bloqueios CSP.
- Teste o host real sem salvar mudanças de página: duas instâncias, Contained →
  FullBleed → Contained, resize, limites de conteúdo e cleanup. Testes transitórios
  não certificam a UI de uma aplicação nem seu fluxo de edição/publicação.
- Para consumidores ativados, valide leitura/edição, foco, zoom e diferentes
  larguras. Não declare migração ou certificação visual apenas pelo upload.
- Registre resultados sanitizados em `tmp/`, sem payloads de listas ou segredos.
- Rollback troca as referências do consumidor para a release anterior e conserva
  os assets imutáveis. Uma distribuição ainda não ativada não modifica a UI
atual e não requer restauração de página.

## Publicação 0.2.0 — 6 de novembro de 2026

A distribuição independente `0.2.0` foi publicada, sem overwrite, em
`SiteAssets/spmiddle/releases/0.2.0/` dos seis destinos autorizados. Isso
**disponibiliza os assets, mas não ativa nem migra consumidores existentes**.
Os pacotes de produção conservam versão individual `0.1.0`; a raiz `0.2.0`
identifica o conjunto com o novo adaptador.

| Site (server-relative) | Verificação dos assets | Teste DOM transitório |
|---|---|---|
| `/teams/camap-agp/pci` | 45/45; hashes, MIME e estados OK | limite de conteúdo SharePoint |
| `/teams/camap-agp` | 45/45; hashes, MIME e estados OK | limite de conteúdo SharePoint |
| `/teams/sapscripting` | 45/45; hashes, MIME e estados OK | página interna `MiniJoomla.aspx` |
| `/teams/Comunidades-de-interesse-627` | 45/45; hashes, MIME e estados OK | limite de conteúdo SharePoint |
| `/teams/Comunidades-de-interesse-191` | 45/45; hashes, MIME e estados OK | biblioteca SiteAssets; **fallback de viewport** |
| `/teams/Comunidades-de-interesse-192` | 45/45; hashes, MIME e estados OK | página interna `Home.aspx`; `contentScrollRegion` |

Foram conferidos **270 arquivos**: tamanho/SHA-256 contra o snapshot local,
inventário exato, MIME JavaScript/CSS, `File.Level=1` (Published) e
`File.CheckOutType=2` (None). Os seis entrypoints de pacotes foram importados
nativamente na sessão de publicação, sem executar CRUD/provisioning.
As bibliotecas tinham versionamento maior, sem checkout obrigatório nem moderação.
Não se alteraram configurações de bibliotecas ou permissões.

O teste criou uma instância sintética temporária no documento de cada destino,
em 320, 768, 1366 e 1920 px. Demonstrou carregamento do script clássico/import,
Contained → FullBleed → Contained, direção RTL local, idempotência e preservação
de `max-width` do filho. Os elementos temporários foram removidos; não se salvaram
páginas. **Não foi teste dentro de uma web part MSE publicada**, nem resize de
uma mesma instância entre tamanhos: isso continua necessário no consumidor real.
Múltiplas instâncias e cleanup/falhas têm cobertura na suíte Node local.

### Dificuldades e soluções preservadas

- A referência local do MSE ignora `<script type="module">`: o entrypoint
  compartilhado é script externo clássico, que usa `import()` nativo, sem eval.
- No último destino, throttling interrompeu upload e algumas leituras retornaram
  HTML de erro com HTTP 200. A retomada aceitou somente arquivos com hash correto
  e acrescentou ausências comprovadas com `overwrite=false`. Leituras foram
  espaçadas com retry limitado; respostas HTML não foram aceitas como assets.
- Consulta ampla de SiteAssets no CAMAP excedeu o list-view threshold. A
  verificação enumerou somente as pastas da release, sem índices ou reconfiguração.
- Páginas iniciais em SAPScripting/Comunidades 191 redirecionaram a sessão para
  fora do destino. O teste verificou origem e caminho antes da manipulação DOM;
  usou página interna em SAPScripting e biblioteca em Comunidades 191. O teste de
  viewport na biblioteca **não comprova geometria MSE desse site**.
- O envelope FIORI-AUTO interpreta um objeto com `ok` como envelope RPC:
  métricas de smoke foram retornadas dentro de `{ ok, code, message, data }`.

### Ferramentas, proveniência e pendências

Implementação em JavaScript/CSS/HTML, sem dependências de runtime adicionais;
Node `24.18.0` para build/testes, Node >=20 declarado, testes VM com
`--experimental-vm-modules`. Publicação/inspeção por FIORI-AUTO `0.3.3`, binário
.NET 9 existente, sessão Edge própria; Python e REST SharePoint pela sessão
autenticada. `npm test`, importações e `git diff --check` passaram.

O snapshot remoto contém 44 arquivos + `release-manifest.json`; SHA-256 do
manifest publicado:

```text
30c8ce8b9b80172f5aaafb1122a127b37e57f183dac236da4525e4525a9e2d72
```

A consolidação documental posterior à publicação existe no Git, não foi
republicada por cima dos assets imutáveis. Portanto, `build:release` após essa
consolidação não deve ser enviado a `releases/0.2.0`: uma nova distribuição de
bytes exige novo identificador de versão. Os arquivos runtime publicados não
foram modificados após o snapshot.

Recibos detalhados e snippets locais estão em `tmp/publication-verification.json`,
`tmp/publication-result.md` e `tmp/publication-snippets/`, ignorados pelo Git.
O perfil do navegador não é versionado, copiado nem compartilhado.

Pendências para a próxima integração: selecionar aplicação/página compatível,
conectar seu bootstrap à raiz filha, garantir um único responsável pela largura,
validar edição/leitura, foco, zoom, resize, CSP e permissões com conta somente
leitora. A inspeção desta etapa usou a conta de publicação, **não comprova acesso
de leitores** nem certifica a UI de aplicações. MiniJoomla embutido, previews
CAMAP e `mse-platform` foram preservados; Explore Mais não foi reativado.
