# SPMIDDLE — piloto `mod_articles_categories`

Este exemplo contém somente o contrato de infraestrutura do piloto:

- schema declarativo da lista nova `mseCategories`;
- mapper entre o domínio do módulo e os campos SharePoint;
- repository de leitura com filtro, ordenação e paginação;
- fake transport para testes locais.

Não há chamada de rede, provisioning, `inspect` remoto ou credencial neste
exemplo. O host do MSE continuará responsável por resolver o cliente e a fonte
permitida antes de qualquer integração real.
