# Changelog

Todas as alterações relevantes deste projeto serão registradas neste arquivo.

O versionamento deste repositório começa em `0.1.0`, independentemente da numeração de versão presente nos comentários internos do Gist original.

## [0.3.1] - 2026-11-13

### Corrigido

- Corrigido falso negativo no carregamento de páginas que mostram apenas cupons já ativados (botões **Conferir** ou **Ver cupom**) e cujos cartões não correspondem aos seletores HTML conhecidos.
- A confirmação da página e a confirmação do conteúdo carregado passam a ser verificações separadas. O script exige um indicador de paginação confiável, conteúdo reconhecível e estabilização, sem depender da presença de botões **Ativar**.
- Ampliados os seletores do número de página ativo para incluir `aria-selected="true"` e variantes de classe do componente de paginação.
- Adicionados diagnósticos quando a página não é confirmada no prazo: URL, página solicitada/selecionada, cartões reconhecidos, botões Ativar/Conferir e estado de carregamento.
- A execução preserva a política de **não repetir cliques** nem ignorar falhas HTTP explícitas.

### Validação

- Testes simulados para página 83 contendo apenas botões Conferir, divergência de número selecionado e spinner ainda ativo.
- **Teste real de ponta a ponta da 0.3.1 ainda não realizado**. A versão 0.3.0 permanece preservada pela tag Git.
- O progresso salvo na chave da 0.3.0 continua compatível.

## [0.3.0] - 2026-11-13

### Adicionado

- Acesso **direto** à página inicial escolhida por meio de `&page=X`, sem percorrer as páginas anteriores.
- Verificação de página por indicador de paginação ou links adjacentes; alterações textuais sozinhas não validam a navegação.
- Espera de estabilização dos elementos de cupom e tratamento de carregamentos lentos.
- Recuperação controlada de falhas na navegação por URL direta, sem repetir cliques em cupons.
- Registro local do progresso, com retomada sugerida da página pendente e proteção contra reprocessar identificadores já tentados.
- Confirmação conservadora da ativação por rótulos explícitos associados ao controle do cupom; tentativas sem evidência ficam como inconclusivas.
- Contadores de páginas, tentativas, confirmações, inconclusivos, ignorados, falhas e tempo ativo.
- Intervalos e tempos de espera configuráveis, além de interrupção em bloqueios e sinais de limitação do serviço.
- Testes automatizados e workflow GitHub Actions com Node.js 24.

### Alterado

- Identificação dos controles restrita a cartões de cupons quando o DOM disponibiliza essa estrutura.
- Controles com identificadores duplicados ou instáveis são ignorados, em vez de tentar inferir pela posição.
- A retomada sem identificadores estáveis é conservadora para não repetir cliques em cupons já tentados.

### Corrigido após validação real (HTTP 403)

- Interrupção imediata quando a ativação recebe **HTTP 401, 403 ou 429**, se o navegador disponibiliza o status da resposta.
- Detecção de aviso **“Tivemos um problema”** e mensagens semelhantes na interface, interrompendo sem exigir leitura da resposta HTTP.
- Proteção contra sequências de falhas HTTP; tentativas inconclusivas não são motivo de interrupção.
- Correção da contagem de falhas para evitar duplicações.
- Testes de regressão simulados para HTTP 403, HTTP 429, HTTP 500, aviso de erro e tentativas inconclusivas.

### Corrigido após testes de novembro de 2026 (falsos inconclusivos)

- Removida a interrupção por três ativações consecutivas sem confirmação, pois a interface pode ativar cupons sem expor os rótulos reconhecidos pelo script.
- Novos rótulos de sucesso: `Conferir` e `Ver cupom`, desde que apareçam no controle do **mesmo** cupom após o clique.
- Os estados preexistentes antes do clique não contam como confirmação.
- Tentativas não verificáveis continuam sendo exibidas como **inconclusivas**, sem interromper a paginação nem aumentar a contagem de erros.
- Testes simulados para múltiplos inconclusivos e mudanças de rótulo.

### Validação funcional — 2026-11-13

- Teste realizado pelo usuário em sessão autenticada no Mercado Livre, com evidência visual da execução.
- Início na página 42, encerramento na página 108 (fim da paginação).
- **67 páginas concluídas; 91 tentativas e 91 ativações confirmadas pela interface**, sem inconclusivos, recusas HTTP, controles ignorados ou falhas.
- Última resposta HTTP exibida: **200**. Tempo ativo: **06:35**.
- Paginação, reconhecimento do estado **Conferir** e detecção do fim da listagem validados no teste.
- **Limitação:** confirmações contabilizadas pelo script a partir da interface; não foi realizada auditoria independente do estado de cada cupom no backend.

### Testes automatizados

- GitHub Actions com Node.js 24, checagem de sintaxe e **20 testes automatizados aprovados**, incluindo fluxos simulados de sucesso, erros HTTP, paginação e retomada.

## [0.2.0] - 2026-11-12

### Adicionado

- Seleção da página inicial para percorrer páginas anteriores sem ativar cupons.
- Pausa e continuação por botão no painel, com suporte à tecla **Esc** para pausar.
- Contagem do tempo ativo que desconsidera o período de pausa.
- Verificações adicionais para confirmar navegação e detectar páginas repetidas.
- Identificação mais cuidadosa de cupons com referência ao elemento ou identificador explícito, interrompendo diante de referências instáveis ou ambíguas.
- Encerramento organizado com remoção de eventos e funções globais.
- Documentação de uso, configurações, limitações e histórico no repositório.

### Observações

- O código atual foi importado do arquivo fornecido pelo usuário sem alterações funcionais.
- Os contadores refletem **tentativas de clique**, não ativações confirmadas.
- Sem persistência de progresso após recarregar/fechar a aba.
- A sintaxe JavaScript foi validada estaticamente; não houve teste de ativação autenticada no Mercado Livre.

## [0.1.0] - Versão histórica

### Adicionado

- Automação inicial para percorrer páginas de cupons e tentar ativar os disponíveis.
- Painel de andamento com controles de interrupção e encerramento.
- Limites de segurança, controle da paginação e resumo de tentativas de clique.

### Origem

- [Gist original fixado na revisão fornecida](https://gist.githubusercontent.com/pitinga/26de31fd8c0cfbf4f7a3c1ed917649e5/raw/c9072ee9721a0574d2620e15b03b5b798c491376/ML-Cupons.js).
- [Código arquivado neste repositório](./versions/0.1.0/ML-Cupons.js) sem alterações.
- A indicação `v2.0` no cabeçalho do arquivo pertence ao histórico de versões do Gist; neste projeto, o arquivo corresponde à versão **0.1.0**.
