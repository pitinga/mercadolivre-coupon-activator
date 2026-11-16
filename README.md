# Mercado Livre Coupon Activator

**Versão 0.3.2 (paginação, filtros e retomada)** · [Histórico de versões](./CHANGELOG.md).

Automação em JavaScript para percorrer a lista de cupons do Mercado Livre e tentar ativar os cupons disponíveis em cada página. A versão 0.3.2 preserva os filtros da aba aberta, identifica a última página em largura total e permite escolher explicitamente entre uma execução nova e uma retomada.

> **Projeto independente:** não é oficial nem afiliado ao Mercado Livre. O funcionamento depende da interface atual do site. Use por sua conta e responsabilidade e respeite as regras da plataforma.

## Funcionalidades da versão 0.3.2

- Percorre as páginas da listagem de cupons, até o limite configurado.
- **Abre diretamente a página inicial** pela URL `&page=X`, sem percorrer as anteriores.
- **Preserva os filtros da URL atual**, incluindo `status=inactive` e `source_page`, ao navegar entre páginas.
- **Identifica a última página na aba principal antes de criar o iframe**, utilizando os links Andes presentes no HTML do site, mesmo quando as reticências são elementos `<i>` sem texto.
- Usa a última página confirmada para detectar encerramento e indicar progresso percentual; se não puder identificá-la, mantém a navegação sequencial conservadora pelo botão **Próxima**.
- Verifica o número da página pelo indicador selecionado ou por links adjacentes confiáveis; interrompe se não conseguir confirmar a página solicitada.
- **Aceita páginas com somente cupons já ativados**, identificados por botões como **Conferir** ou pelo conteúdo das ofertas, mesmo sem botões **Ativar** ou cartões reconhecidos pelos seletores antigos.
- Procura controles com textos como **Aplicar**, **Ativar** e **Resgatar**.
- Exibe um painel com página atual, quantidade de tentativas e andamento.
- Permite **Pausar/Continuar** e **Fechar**; a tecla **Esc** pausa a execução.
- Aguarda a estabilização dos elementos antes de começar cada página e aplica intervalos configuráveis.
- Tenta recuperar falhas de navegação usando a URL direta, **sem repetir cliques em cupons**.
- Registra **tentativas, ativações confirmadas pela interface, inconclusivas, recusas HTTP, ignorados e falhas**.
- **Interrompe a execução diante de HTTP 401, 403 ou 429** na ativação, ou diante de mensagens como **“Tivemos um problema”**; não repete requisições recusadas.
- Interrompe após duas respostas HTTP de falha consecutivas (configurável), mas **não interrompe por ausência de confirmação visual**. Tentativas sem evidência são contabilizadas como inconclusivas, e não como falhas.
- Salva localmente a última página concluída e os identificadores dos cupons já tentados na página pendente, **separando o registro de cada listagem/filtro**. Não salva credenciais.
- **Começa do zero por padrão**; a retomada é ativada explicitamente em `CONFIG.retomarProgresso`.
- Contém proteções para interromper a execução quando não consegue confirmar uma mudança de página ou identificar um controle com segurança.
- Mostra diagnóstico no Console somente quando uma página não é confirmada no prazo (URL, número selecionado, quantidade de cartões, botões Ativar/Conferir e carregamento).

## Como usar

1. Faça login na sua conta do Mercado Livre.
2. Abra a [página de todos os cupons](https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all) ou uma listagem filtrada que deseja processar.
3. Abra as ferramentas de desenvolvedor do navegador (**F12**) e selecione **Console**.
4. Copie integralmente o conteúdo de [`mercadolivre-coupon-activator.js`](./mercadolivre-coupon-activator.js), cole no console e pressione **Enter**.
5. Informe a página inicial (padrão **1**). Por exemplo, `50` abrirá diretamente `...&page=50`. Se configurar `CONFIG.paginaInicial` com um número, o diálogo será dispensado.
6. Antes do iframe ser criado, o script examina a paginação na aba principal com toda a largura disponível; se conseguir confirmar a última página, exibe o total no painel. Maximize a janela e, se necessário, desencaixe o DevTools para aumentar a largura de visualização.
7. Acompanhe o painel. Use **Pausar/Continuar**, **Esc** ou **Fechar** conforme necessário. Para continuar uma execução interrompida, altere `retomarProgresso` para `true` antes de executar novamente.
8. Uma nova execução (`retomarProgresso: false`) substitui o progresso salvo **daquela mesma listagem** por um registro limpo. Com o script pausado ou finalizado, `limparProgressoCupons()` também remove o registro atual; a limpeza não reinicia a execução.

Alguns navegadores exigem uma confirmação adicional antes de permitir a colagem de código no console. Leia e compreenda o script antes de executá-lo.

## Configuração

As opções ficam no objeto `CONFIG` no início do arquivo.

| Opção | Padrão | Descrição |
| --- | ---: | --- |
| `paginaInicial` | `null` | Pergunta no início; informe um número para iniciar sem diálogo |
| `paginaFinal` | `null` | Detecta pela página principal; informe um número para fixar o limite |
| `retomarProgresso` | **`false`** | Nova execução por padrão; `true` recupera o progresso da mesma listagem |
| `maxPaginas` | `200` | Máximo de páginas processadas por execução |
| `limiteMaximoPaginas` | `500` | Maior total de páginas admitido para validar o detector |
| `maxCuponsPorPagina` | `300` | Limite de controles por página |
| `intervaloCliquesMs` | `1000` | Espera adicional após cada tentativa |
| `esperaConfirmacaoMs` | `1800` | Tempo para verificar evidência de ativação |
| `esperaAposPaginaMs` | `550` | Tempo de estabilização da página |
| `esperaAposCuponsMs` | `600` | Espera após concluir os cupons |
| `intervaloVerificacaoMs` | `250` | Frequência de verificação do DOM |
| `timeoutPrimeiraPaginaMs` | `25000` | Timeout de carregamento inicial |
| `timeoutMudancaPaginaMs` | `16000` | Timeout da mudança de página |
| `timeoutDeteccaoPaginasMs` | `15000` | Timeout da identificação da última página na aba principal |
| `esperaEstabilizacaoPaginacaoMs` | `1000` | Tempo necessário para estabilizar o total detectado |
| `maxTentativasNavegacao` | `2` | Tentativas de acesso direto após falha |
| `maxFalhasHttpConsecutivas` | `2` | Máximo de erros HTTP consecutivos não fatais antes da interrupção |

O estado é guardado no `localStorage` da origem do Mercado Livre sob uma chave no formato `ml-coupon-activator:progress:0.3.2:<filtro>`, onde a identificação da listagem é obtida da URL sem `page`, com os parâmetros ordenados. **A chave antiga da 0.3.0/0.3.1 não é reutilizada**, pois ela não distinguia filtros: retomá-la poderia aplicar o progresso de outra listagem. Esse registro antigo não é apagado. Caso o navegador bloqueie o armazenamento, a execução poderá continuar, **mas a retomada não será persistida**.

### Regras para retomada segura

- A página só é considerada concluída após o loop terminar.
- Se `retomarProgresso: true` e o registro corresponder à URL/listagem atual, a página interrompida será sugerida na próxima execução.
- Cupons com identificadores explícitos já tentados na página pendente são ignorados para evitar novos cliques.
- Se um cupom **sem identificador estável** já tiver sido tentado naquela página, outros controles sem identificador serão ignorados na retomada para evitar duplicações. Isso pode deixar alguns cupons sem tentativa. É uma decisão conservadora de segurança.
- **Uma tentativa não é uma ativação confirmada**. Quando a interface não fornecer um rótulo explícito, a tentativa é registrada como inconclusiva.

## Limitações conhecidas

- Para obter o código HTTP, o script consulta as entradas de desempenho de rede **já coletadas pelo navegador** (`PerformanceResourceTiming.responseStatus`), sem alterar nem repetir as chamadas do Mercado Livre. Quando o navegador não expõe esse dado, usa os avisos visíveis; nenhum dos dois mecanismos garante detectar todos os erros.
- A mensagem **“Tivemos um problema”** interrompe por segurança, mesmo que não seja possível determinar o status da requisição. **HTTP 403 não confirma, por si só, a causa da recusa.** Não há implementação de contorno de bloqueios.
- A confirmação visual reconhece mudanças de estado do controle associado ao cupom, incluindo `Ativado`, `Resgatado`, `Conferir` e `Ver cupom`. Um texto de sucesso que já estava presente antes do clique **não** é confirmação. Esses rótulos são indicadores heurísticos e podem mudar conforme o site.
- Sem um sinal explícito associado ao mesmo cupom, o resultado é **inconclusivo**, ainda que a ativação tenha ocorrido. A execução **continua** nesses casos; ela só interrompe diante de falhas e bloqueios detectados.
- A página solicitada precisa ser confirmada por elementos confiáveis de paginação; caso contrário, a execução para antes de ativar cupons.
- O script depende da estrutura HTML do site e do acesso do navegador ao conteúdo do `iframe` na mesma origem.
- A última página só é considerada conhecida se houver evidência confiável. O detector prioriza a estrutura Andes (`li.andes-pagination__dots` e o link posterior) e confirma número, URL e, quando disponível, `aria-label`. Se não houver evidência, o script prossegue usando **Próxima**, sem inventar um total a partir de números locais.
- Uma página incompleta que contiver controles sem identificadores únicos pode ter cupons ignorados na retomada para evitar duplicações.
- O código é para uso manual no console; não contorna CAPTCHA, restrições de sessão nem bloqueios do Mercado Livre.
- Os testes automatizados utilizam navegador simulado, incluindo modelos reduzidos da paginação HTML recebida. A validação funcional autenticada documentada abaixo pertence a uma **versão anterior**; a 0.3.2 ainda precisa ser validada em sessão real do navegador.

## Validação

O workflow [JavaScript CI](./.github/workflows/ci.yml) roda com **Node.js 24**, verifica a sintaxe do script e executa testes de navegação direta e retomada usando `node:test`.

Para executar localmente:

```bash
node --check mercadolivre-coupon-activator.js
node --test tests/*.test.cjs
```

### Validação funcional — 13/11/2026

Em execução autenticada de uma **versão anterior** compartilhada pelo usuário: **67 páginas concluídas**, da página 42 até a **108**, com **91 tentativas e 91 confirmações visuais**, nenhuma recusa, falha ou ativação inconclusiva, em **06:35**. O encerramento ocorreu ao chegar ao fim da paginação. O resultado é evidência do comportamento daquela versão e de seus contadores, não uma auditoria independente do servidor nem um teste da 0.3.2.

## Histórico de versões

| Versão | Código | Principais características |
| --- | --- | --- |
| **0.3.2 (atual)** | [`mercadolivre-coupon-activator.js`](./mercadolivre-coupon-activator.js) | Preserva filtros, detecta o total antes do iframe, isola progresso por listagem e controla a retomada |
| **0.3.1 (histórica)** | [`mercadolivre-coupon-activator.js`](https://github.com/pitinga/mercadolivre-coupon-activator/blob/0.3.1/mercadolivre-coupon-activator.js) | Confirma páginas que contêm somente cupons já ativados e amplia diagnósticos |
| **0.3.0 (histórica)** | [`mercadolivre-coupon-activator.js`](https://github.com/pitinga/mercadolivre-coupon-activator/blob/0.3.0/mercadolivre-coupon-activator.js) | URL direta, validação de paginação, persistência, confirmação conservadora, recuperação e painel ampliado |
| **0.2.0 (histórica)** | [`mercadolivre-coupon-activator.js`](https://github.com/pitinga/mercadolivre-coupon-activator/blob/0.2.0/mercadolivre-coupon-activator.js) | Página inicial configurável, pausa/continuação, validações adicionais de navegação e controles |
| **0.1.0 (histórica)** | [`versions/0.1.0/ML-Cupons.js`](./versions/0.1.0/ML-Cupons.js) | Primeira versão deste projeto, proveniente do [Gist original](https://gist.githubusercontent.com/pitinga/26de31fd8c0cfbf4f7a3c1ed917649e5/raw/c9072ee9721a0574d2620e15b03b5b798c491376/ML-Cupons.js) |

A versão 0.1.0 foi preservada **sem alterações de código**. Seu comentário interno menciona `v2.0`, nomenclatura própria do Gist, distinta do versionamento adotado neste repositório.

O experimento de **10 blocos e 5 iframes** está disponível separadamente em [`mercadolivre-coupon-activator-parallel.js`](./mercadolivre-coupon-activator-parallel.js), com documentação própria em [`EXPERIMENT-PARALLEL.md`](./EXPERIMENT-PARALLEL.md). Ele **não faz parte da versão sequencial 0.3.2** nem foi promovido a release estável.

Consulte o [CHANGELOG](./CHANGELOG.md) para acompanhar a evolução do projeto.

## Licença

Distribuído sob a licença [MIT](./LICENSE).
