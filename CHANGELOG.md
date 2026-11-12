# Changelog

Todas as alterações relevantes deste projeto serão registradas neste arquivo.

O versionamento deste repositório começa em `0.1.0`, independentemente da numeração de versão presente nos comentários internos do Gist original.

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
