# SPMIDDLE — Operação e Deploy (local/host)

## Build local

- `npm test` roda pacotes + exemplos + testes de layout MSE (offline).
- `node scripts/build-release.js` gera `dist/<version>/` + `release-manifest.json`.

## Deploy (conceitual)

- Publicar assets em pasta imutável no host (ex.: SiteAssets) e apontar o snippet/loader para a versão.
- Nunca sobrescrever versões anteriores.
- Validar MIME e hashes conforme manifest.

## Recuperação

- Se algo falhar, voltar o ponteiro do host para a versão anterior (rollback seletivo).
