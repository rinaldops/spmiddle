# SPMIDDLE

> Middleware JavaScript **client-side** para aplicações que utilizam o SharePoint como infraestrutura de persistência e consulta.

O SPMIDDLE executa no navegador e usa a sessão e as permissões do usuário corrente para acessar o SharePoint. O projeto **não** tem backend próprio no baseline atual.

## Propósito

Prover uma camada reutilizável (schemas, mappers, repositories e clientes especializados) para que aplicações JavaScript usem o SharePoint REST com:

- contratos explícitos (sem OData arbitrário vindo da UI);
- paginação limitada e previsível;
- ETags e concorrência;
- erros tipados e retry controlado;
- provisionamento administrativo `inspect → apply → verify`;
- guardrails de segurança para rich text, URLs e arquivos;
- suíte local baseada em fake SharePoint (sem depender de tenant real).

## Invariantes (contratos e restrições)

Estas regras são parte do contrato do projeto (não são “dicas”). Elas devem permanecer verdadeiras a menos que haja decisão explícita em ADR ou atualização do plano:

- **Client-side, sem elevação:** o middleware roda no navegador; permissões e identidade continuam sendo do SharePoint/usuário corrente. Não há cofre de segredos nem fronteira de autorização no frontend.
- **Sem segredos em código/assets/docs:** não gravar tokens, cookies, credenciais, GUIDs/URLs corporativos reais ou dados pessoais.
- **Allowlist e caminhos server-relative:** não aceitar `webUrl`/`listPath`/`listId` arbitrários provenientes de UI. Validar sempre que requests permanecem no `/_api` do site allowlisted.
- **ETag obrigatório em escritas relevantes:** `update`/`delete` requerem ETag exata (sem `If-Match: *` por default).
- **Provisionamento fora do startup:** provisioning só em fluxo administrativo confirmado (`inspect → plano → confirmação → apply → verify`).
- **Publicação imutável:** releases independentes no SharePoint devem ir para pastas versionadas e imutáveis (`SiteAssets/spmiddle/releases/<versão>/`), sem overwrite.
- **Testes locais sem tenant real:** a suíte usa transporte simulado; automação/inspeção em navegador corporativo segue a diretriz do workspace (FIORI-AUTO).

## Documentação canônica

- Contratos (canônico): [docs/CONTRATOS.md](docs/CONTRATOS.md)
- Arquitetura (canônico): [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Transporte REST e cliente de listas: [docs/CONTRATOS.md](docs/CONTRATOS.md#api-surface)
- Contratos: [schema](docs/CONTRATOS.md#schema-contract), [query](docs/CONTRATOS.md#query-contract)
- Provisionamento: [provisioning](docs/CONTRATOS.md#provisioning)
- Limites e defaults: [limits](docs/CONTRATOS.md#limits)
- Catálogo de erros: [errors](docs/CONTRATOS.md#error-catalog)
- Política de segurança (divulgação responsável): [`SECURITY.md`](SECURITY.md)
- Operação e deploy (canônico): [docs/OPERACAO-E-DEPLOY.md](docs/OPERACAO-E-DEPLOY.md)
- Diretriz e roadmap (não substitui os contratos implementados): [`PLANO-SPMIDDLE.md`](PLANO-SPMIDDLE.md)

## Modern Script Editor (MSE): diretriz de largura em novas publicações

Para consumidores SPMIDDLE publicados no MSE, a preferência para novos snippets e revisões autorizadas é **`FullBleed`**, com `data-spmiddle-layout="FullBleed"` explícito no wrapper.

- `Contained` permanece como exceção explícita (solicitação do usuário ou limitação validada do host).
- A diretriz não altera páginas existentes automaticamente.

O contrato completo (assets, snippet, bootstrap, cleanup e limitações) está na seção 17 do manual: [docs/CONTRATOS.md](docs/CONTRATOS.md#api-surface).

## Testes

```powershell
npm test
```

O acesso a tenant real não faz parte da suíte local; testes usam transporte HTTP simulado.

## Estado e histórico recente (resumo)

- Baseline atual: fundação REST e de domínio dividida em pacotes especializados (outubro de 2026). Ver arquitetura e contratos em `docs/`.
- Publicação `0.2.0`: assets publicados em seis sites autorizados; consumidores/páginas não migrados. Ver [docs/OPERACAO-E-DEPLOY.md](docs/OPERACAO-E-DEPLOY.md).
- Preview CAMAP (histórico, outubro/2026): baseline `83183d6` (não é o HEAD atual), asset imutável `.../preview/...-v9/` e teste de `Preview.aspx` com `rootMounts=1`, `fullReloads=0`, `internalNavigations=0`. Integração somente leitura, sem substituir ou alterar `mse-platform`; Explore Mais foi descartado/despublicado neste site e a lista técnica temporária `RecursosLinks` foi removida. Não reativar esse consumidor automaticamente.
- Atualizações internas devem manter o container MSE vivo: ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e o contrato local em [`examples/incremental-mse-host/`](examples/incremental-mse-host/).
