# Atualização incremental no host MSE

## Diretriz arquitetural

Quando uma página ASPX já estiver carregada e o MSE possuir o código e os dados
necessários para atender uma ação, a ação deve permanecer confinada ao host/MSE.
O comportamento padrão não deve navegar novamente para a página nem reconstruir
toda a árvore do site.

Em termos práticos, o MSE deve funcionar como um container vivo durante a sessão
da página:

```text
página ASPX carregada uma vez
        ↓
raiz MSE permanece montada
        ↓
ação interna → estado/consulta/layout afetado é atualizado
        ↓
somente a região necessária é renderizada novamente
```

Essa diretriz reduz custo de rede e processamento, evita destruir componentes já
renderizados e mantém o estado de interação do usuário. Ela é um requisito de
desempenho, estabilidade e experiência, não uma otimização opcional.

## Separação de responsabilidades

### Núcleo SPMIDDLE

O núcleo deve permanecer independente de DOM, MSE, `window`, rotas e CSS. Ele
fornece as operações que tornam uma atualização local possível:

- leitura controlada;
- atualização e criação com ETag;
- invalidação ou revalidação explícita de dados;
- estados de carregamento, vazio e erro;
- mappers e view-models serializáveis;
- limites, sanitização e tratamento de concorrência.

O núcleo não decide como uma página navega nem manipula elementos visuais.

### Adaptador MSE/host

O adaptador específico do host deve:

1. montar uma raiz estável uma única vez;
2. registrar ações internas sem usar links que naveguem para a mesma ASPX;
3. atualizar apenas o estado, fonte ou região afetada;
4. preservar instâncias e estado não afetados;
5. cancelar ou ignorar respostas obsoletas quando o usuário fizer nova ação;
6. manter foco, teclado, mensagens de estado e acessibilidade após a atualização;
7. usar navegação completa somente quando a ação exigir novo contexto.

O adaptador não deve duplicar consultas, regras de domínio ou sanitização do
SPMIDDLE para conseguir atualização incremental.

## Classificação de ações

Antes de executar uma ação, o host deve classificá-la:

| Tipo | Comportamento esperado |
| --- | --- |
| Consulta da mesma fonte | atualizar somente estado e região de dados |
| Filtro, busca ou ordenação local | atualizar view-model e região de lista |
| CRUD de item | executar operação pelo SPMIDDLE e revalidar a coleção afetada |
| Mudança de layout do componente | atualizar somente a raiz/região MSE |
| Mudança de configuração já carregada | atualizar configuração e renderizar regiões dependentes |
| Link externo | navegação normal, com política segura de destino |
| Outra página, site ou contexto | navegação completa permitida e explícita |
| Ação sem dados suficientes no host | fallback documentado; não fingir atualização local |

“Atualizar” não deve significar automaticamente `location.reload()`, atribuição
de `window.location` para a mesma página ou clique sintético em um link ASPX.

## Estado e concorrência

Uma atualização incremental deve ter um ciclo observável:

```text
idle → loading → ready
                 ↘ empty
                 ↘ error
```

O host deve manter o último estado válido durante uma nova consulta quando isso
for seguro, indicar que há atualização em andamento e impedir que uma resposta
antiga sobrescreva uma ação mais recente. Escritas devem preservar ETags e
continuar sem retry automático pelo SPMIDDLE.

Após uma escrita, o host deve escolher explicitamente entre:

- atualizar o item local com a resposta validada;
- revalidar a coleção afetada;
- invalidar a região e solicitar nova leitura.

Não é permitido presumir que uma página inteira precise ser reconstruída para
refletir uma alteração de lista.

## Critérios de aceite

Um host compatível com esta diretriz deve demonstrar localmente, por fake host ou
teste de navegador autorizado em etapa posterior:

1. a raiz do MSE é montada uma vez;
2. uma ação interna não chama `location.reload`, não navega para a mesma ASPX e
   não desmonta regiões não afetadas;
3. a consulta ou escrita ocorre pelo contrato SPMIDDLE;
4. somente a região afetada muda;
5. estados de carregamento, vazio e erro são observáveis;
6. respostas fora de ordem não corrompem o estado mais recente;
7. ações externas e mudanças de contexto usam fallback explícito;
8. foco e acessibilidade são preservados na renderização incremental;
9. a métrica de navegação/reload completo permanece zero para o fluxo interno.

## Limites desta etapa

Os hosts atuais validam contratos em Node.js e não comprovam ainda o ciclo de
vida de uma página ASPX real. Portanto, esta diretriz passa a ser requisito para
o próximo host MSE/integração, mas não constitui publicação nem autoriza
automação de navegador ou acesso a tenant.

Uma validação real deverá usar o FIORI-AUTO obrigatório do workspace, destino de
produção explicitamente autorizado, dados mínimos e um plano de rollback. O
primeiro teste operacional deve medir que uma ação interna preserva a página e
atualiza somente o container MSE.
