# Mercado Livre Coupon Activator

**Desenvolvimento da versão 0.3.0** · Branch `develop/0.3.0`. A versão estável continua sendo a **0.2.0** na `main`.

Automação em JavaScript para percorrer a lista de cupons do Mercado Livre e tentar ativar os cupons disponíveis em cada página. A versão em desenvolvimento permite abrir diretamente a página escolhida com `&page=X`, confirmar a navegação e retomar execuções interrompidas.

> **Projeto independente:** não é oficial nem afiliado ao Mercado Livre. O funcionamento depende da interface atual do site. Use por sua conta e responsabilidade e respeite as regras da plataforma.

## Funcionalidades da versão 0.3.0 (em desenvolvimento)

- Percorre as páginas da listagem de cupons, até o limite configurado.
- **Abre diretamente a página inicial** pela URL `&page=X`, sem percorrer as anteriores.
- Verifica o número da página pelo indicador selecionado ou por links adjacentes confiáveis; interrompe se não conseguir confirmar a página solicitada.
- Procura controles com textos como **Aplicar**, **Ativar** e **Resgatar**.
- Exibe um painel com página atual, quantidade de tentativas e andamento.
- Permite **Pausar/Continuar** e **Fechar**; a tecla **Esc** pausa a execução.
- Aguarda a estabilização dos elementos antes de começar cada página e aplica intervalos configuráveis.
- Tenta recuperar falhas de navegação usando a URL direta, **sem repetir cliques em cupons**.
- Registra **tentativas, ativações confirmadas pela interface, inconclusivas, recusas HTTP, ignorados e falhas**.
- **Interrompe a execução diante de HTTP 401, 403 ou 429** na ativação, ou diante de mensagens como **“Tivemos um problema”**; não repete requisições recusadas.
- Interrompe após duas respostas HTTP de falha consecutivas (configurável), mas **não interrompe por ausência de confirmação visual**. Tentativas sem evidência são contabilizadas como inconclusivas, e não como falhas.
- Salva localmente a última página concluída e os identificadores dos cupons já tentados na página pendente. Não salva credenciais.
- Contém proteções para interromper a execução quando não consegue confirmar uma mudança de página ou identificar um controle com segurança.

## Como usar

1. Faça login na sua conta do Mercado Livre.
2. Abra a [página de todos os cupons](https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all).
3. Abra as ferramentas de desenvolvedor do navegador (**F12**) e selecione **Console**.
4. Copie integralmente o conteúdo de [`mercadolivre-coupon-activator.js`](./mercadolivre-coupon-activator.js), cole no console e pressione **Enter**.
5. Informe a página inicial: o padrão é **1**, ou a página pendente salva na execução anterior. Por exemplo, `50` abrirá diretamente `...&page=50`.
6. Acompanhe o painel. Use **Pausar/Continuar**, **Esc** ou **Fechar** conforme necessário. Se reiniciar o script, a página pendente será sugerida automaticamente.
7. Para recomeçar, informe `1` ao iniciar. Com o script pausado ou finalizado, `limparProgressoCupons()` também remove o histórico salvo; a limpeza não reinicia a execução atual.

Alguns navegadores exigem uma confirmação adicional antes de permitir a colagem de código no console. Leia e compreenda o script antes de executá-lo.

## Configuração

As opções ficam no objeto `CONFIG` no início do arquivo.

| Opção | Padrão | Descrição |
| --- | ---: | --- |
| `maxPaginas` | `200` | Máximo de páginas processadas por execução |
| `maxCuponsPorPagina` | `300` | Limite de controles por página |
| `intervaloCliquesMs` | `1000` | Espera adicional após cada tentativa |
| `esperaConfirmacaoMs` | `1800` | Tempo para verificar evidência de ativação |
| `esperaAposPaginaMs` | `550` | Tempo de estabilização da página |
| `esperaAposCuponsMs` | `600` | Espera após concluir os cupons |
| `intervaloVerificacaoMs` | `250` | Frequência de verificação do DOM |
| `timeoutPrimeiraPaginaMs` | `25000` | Timeout de carregamento inicial |
| `timeoutMudancaPaginaMs` | `16000` | Timeout da mudança de página |
| `maxTentativasNavegacao` | `2` | Tentativas de acesso direto após falha |
| `maxFalhasHttpConsecutivas` | `2` | Máximo de erros HTTP consecutivos não fatais antes da interrupção |

O estado é guardado no `localStorage` da própria origem do Mercado Livre sob a chave `ml-coupon-activator:progress:0.3.0`. Caso o navegador bloqueie o armazenamento, a execução poderá continuar, **mas a retomada não será persistida**.

### Regras para retomada segura

- A página só é considerada concluída após o loop terminar.
- Se a execução for interrompida durante uma página, essa página será sugerida na próxima execução.
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
- Uma página incompleta que contiver controles sem identificadores únicos pode ter cupons ignorados na retomada para evitar duplicações.
- O código é para uso manual no console; não contorna CAPTCHA, restrições de sessão nem bloqueios do Mercado Livre.
- Os testes automatizados utilizam navegador simulado. **Nenhum teste autenticado de ativação real foi realizado**.

## Validação

O workflow [JavaScript CI](./.github/workflows/ci.yml) roda com **Node.js 24**, verifica a sintaxe do script e executa testes de navegação direta e retomada usando `node:test`.

Para executar localmente:

```bash
node --check mercadolivre-coupon-activator.js
node --test tests/*.test.cjs
```

## Histórico de versões

| Versão | Código | Principais características |
| --- | --- | --- |
| **0.3.0 (desenvolvimento)** | [`mercadolivre-coupon-activator.js`](./mercadolivre-coupon-activator.js) | URL direta, validação de paginação, persistência, confirmação conservadora, recuperação e painel ampliado |
| **0.2.0 (estável na main)** | [`mercadolivre-coupon-activator.js`](./mercadolivre-coupon-activator.js) | Página inicial configurável, pausa/continuação, validações adicionais de navegação e controles |
| **0.1.0 (histórica)** | [`versions/0.1.0/ML-Cupons.js`](./versions/0.1.0/ML-Cupons.js) | Primeira versão deste projeto, proveniente do [Gist original](https://gist.githubusercontent.com/pitinga/26de31fd8c0cfbf4f7a3c1ed917649e5/raw/c9072ee9721a0574d2620e15b03b5b798c491376/ML-Cupons.js) |

A versão 0.1.0 foi preservada **sem alterações de código**. Seu comentário interno menciona `v2.0`, nomenclatura própria do Gist, distinta do versionamento adotado neste repositório.

Consulte o [CHANGELOG](./CHANGELOG.md) para acompanhar a evolução do projeto.

## Licença

Distribuído sob a licença [MIT](./LICENSE).
