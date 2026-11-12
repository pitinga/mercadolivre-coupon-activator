# Mercado Livre Coupon Activator

Automação em JavaScript para percorrer a lista de cupons do Mercado Livre e tentar ativar os cupons disponíveis em cada página.

> **Projeto independente:** não é oficial nem afiliado ao Mercado Livre. O funcionamento depende da interface atual do site. Use por sua conta e responsabilidade e respeite as regras da plataforma.

## Funcionalidades atuais

- Percorre as páginas da listagem de cupons, até o limite configurado.
- Permite escolher a página inicial, passando pelas anteriores sem ativar seus cupons.
- Procura controles com textos como **Aplicar**, **Ativar** e **Resgatar**.
- Exibe um painel com página atual, quantidade de tentativas e andamento.
- Permite **Pausar/Continuar** e **Fechar**; a tecla **Esc** pausa a execução.
- Aplica intervalos entre os cliques e limites de tempo para carregamento e navegação.
- Contém proteções para interromper a execução quando não consegue confirmar uma mudança de página ou identificar um controle com segurança.

## Como usar

1. Faça login na sua conta do Mercado Livre.
2. Abra a [página de todos os cupons](https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all).
3. Abra as ferramentas de desenvolvedor do navegador (**F12**) e selecione **Console**.
4. Copie integralmente o conteúdo de [`mercadolivre-coupon-activator.js`](./mercadolivre-coupon-activator.js), cole no console e pressione **Enter**.
5. Informe a página inicial (pressione **Enter** para usar a página 1).
6. Acompanhe o painel. Use **Pausar/Continuar**, **Esc** ou **Fechar** conforme necessário.

Alguns navegadores exigem uma confirmação adicional antes de permitir a colagem de código no console. Leia e compreenda o script antes de executá-lo.

## Configuração

As opções ficam no objeto `CONFIG` no início do arquivo.

| Opção | Padrão | Descrição |
| --- | ---: | --- |
| `maxPaginas` | `200` | Limite de páginas processadas |
| `maxCuponsPorPagina` | `300` | Quantidade máxima de controles localizados por página |
| `intervaloCliquesMs` | `650` | Intervalo entre tentativas de clique |
| `esperaAposPaginaMs` | `1400` | Espera após uma mudança de página |
| `esperaAposCuponsMs` | `1100` | Espera ao terminar os cupons da página |
| `timeoutPrimeiraPaginaMs` | `25000` | Tempo máximo para carregar a listagem inicial |
| `timeoutMudancaPaginaMs` | `16000` | Tempo máximo para confirmar uma navegação |

## Limitações conhecidas

- **Tentativas não são confirmações.** O script conta cliques, mas ainda não confirma individualmente se cada cupom foi ativado.
- **Sem persistência.** A pausa e a retomada funcionam apenas enquanto a aba e o painel permanecem abertos.
- **Dependência da interface.** Mudanças no HTML, nos textos dos botões, na paginação ou nas regras de incorporação em `iframe` podem impedir o funcionamento.
- **Listagens dinâmicas.** A interface pode recriar botões e alterar o conteúdo da página, levando a uma interrupção preventiva.
- **Sem testes de integração reais.** A sintaxe JavaScript foi validada, mas a ativação em conta autenticada não foi testada nesta versão.

## Evolução planejada

1. Confirmar a navegação por identificadores mais robustos.
2. Melhorar a identificação de cupons em páginas dinâmicas.
3. Distinguir ativações confirmadas, tentativas, ignorados e erros.
4. Persistir o progresso para permitir retomada após recarregar a página.
5. Melhorar o painel e tratar erros transitórios sem repetir cliques indevidos.

## Licença

Distribuído sob a licença [MIT](./LICENSE).
