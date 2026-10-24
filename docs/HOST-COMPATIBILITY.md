# Compatibilidade entre hosts

Este documento consolida os três hosts locais usados para validar que o contrato
do SPMIDDLE pode ser consumido por diferentes estilos de aplicação. Todos usam
transporte fake, dados com placeholders e execução local. Nenhum deles é uma
implantação SharePoint, SPFx ou migração do `mse-platform`.

## Matriz de compatibilidade

| Host | Entrada principal | Saída | Dependências de UI | Validação |
| --- | --- | --- | --- | --- |
| JavaScript standalone | fonte + client/transport injetado | render model serializável | nenhuma | composição básica e transporte fake |
| React-compatible | propriedades + serviço | view-model estável com estados | nenhuma; React é opcional no consumidor | estabilidade referencial, loading/erro e apresentação |
| SPFx-compatible | contexto, fonte e transporte | estado de ciclo de vida (`loading`, `ready`, `empty`, `error`) | nenhuma; pacotes `@microsoft/sp-*` ficam no consumidor real | validação de contexto, propriedades e atualização |

## Contrato comum

Os hosts compartilham as seguintes fronteiras:

1. recebem configuração explícita;
2. reutilizam `createRecursosCompatibilityService` em vez de duplicar filtros,
   ordenação, mapeamento ou sanitização;
3. recebem o transporte por injeção;
4. não fazem chamadas de rede implícitas nos testes;
5. expõem somente dados simples e serializáveis à apresentação;
6. mantêm falhas em estado observável e sem credenciais, cookies ou headers;
7. usam `webUrl` server-relative e placeholders nos exemplos públicos.

O contrato comum é deliberadamente comportamental, não uma API única de host.
Assim, um host pode seguir o ciclo de vida de uma web part e outro pode somente
produzir um render model, sem introduzir uma abstração artificial no núcleo.

## Diferenças intencionais

- O host standalone demonstra a menor composição possível.
- O host React-compatible enfatiza a forma do view-model e a estabilidade para
  uma futura camada React, mas não instala React nem renderiza DOM.
- O host SPFx-compatible modela contexto, propriedades e atualização de estado,
  mas não implementa `BaseClientSideWebPart`, manifest, bundle ou `.sppkg`.

Essas diferenças justificam testes específicos por host. Um teste compartilhado
que exigisse os mesmos nomes e métodos reduziria a fidelidade das validações e
criaria uma dependência de apresentação no SPMIDDLE. A cobertura compartilhada é
obtida pelo adaptador de domínio e pelos testes do pacote; os hosts verificam
somente a tradução de suas fronteiras próprias.

## Como validar

Na raiz de `SPMIDDLE`:

```powershell
node examples/standalone-host/host.test.js
node examples/react-compatible-host/host.test.js
node examples/spfx-compatible-host/host.test.js
npm test
```

`npm test` inclui os três testes de host e os testes do pacote, contratos REST,
integração local e adaptador do primeiro consumidor.

## Limites e próxima integração

Os testes locais não comprovam autenticação, autorização, digest, ETags,
permissões, CSP, cache, throttling ou publicação em SharePoint. A integração
real deve ser planejada separadamente, com destino de produção autorizado,
regressão, proveniência, permissões e rollback. Nenhum arquivo do
`mse-platform` é alterado por estes exemplos.
