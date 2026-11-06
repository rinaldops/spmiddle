# Layout escolhido pelo publicador no MSE

Exemplo de aplicação pronta e responsiva (`app.js`/`app.css`), integrada por
`bootstrap.js` ao adaptador de host compartilhado. A aplicação não conhece
SharePoint nem lê `Contained`/`FullBleed`; o bootstrap aplica a largura antes de
montá-la na raiz filha.

## Usar o snippet

1. Consulte a [seção 17 do manual](../../docs/CONSUMER-MANUAL.md#17-layout-de-publicação-no-modern-script-editor).
2. Em uma publicação autorizada, mantenha esta árvore sob uma nova pasta de assets:

   ```text
   host-v1/
     host-adapters/modern-script-editor/{layout.css,layout.js,spmiddle-mse-host.js}
     examples/mse-layout/{app.css,app.js,bootstrap.js}
   ```

3. Substitua `/sites/example/SiteAssets/spmiddle/host-v1/` em `snippet.html` pela
   pasta versionada aprovada e insira o trecho no Modern Script Editor.
4. Escolha `data-spmiddle-layout="Contained"` ou `"FullBleed"` no wrapper.
   Não há mudança em `app.js` ou `app.css`.

`Contained` mantém o espaço da seção atual. `FullBleed` expande o wrapper até a
área útil de conteúdo, mas a aplicação de exemplo conserva `max-width: 1200px`.
Ela não será obrigada a ocupar toda a área ampliada.

O snippet usa scripts externos clássicos e imports nativos relativos; confirme
MIME, CSP e permissões. O host deve carregar antes do bootstrap, que aguarda
`SPMiddleMseHost.ready`. Não há scripts inline, CDN, rede de
dados, provisioning ou publicação executada pelo exemplo. Prefira seção de uma
coluna em FullBleed.

O evento `spmiddle-example-dispose` no wrapper demonstra cleanup local antes de
remover a instância. Em uma aplicação real, conserve o controller e integre
`dispose()` ao ciclo de vida do seu host. Não é uma API global do SPMIDDLE.

## Testes e limites

```powershell
npm run test:mse-layout
```

Os testes locais do adaptador usam doubles de geometria/eventos, não navegador.
Não comprovam aparência, foco, zoom, RTL ou expansão na página SharePoint real.
Valide esses cenários pela ferramenta corporativa autorizada antes de publicar.
O adaptador não remove cabeçalho/navegação, não corrige CSS que escape do
container e não altera estilos de outras web parts.
