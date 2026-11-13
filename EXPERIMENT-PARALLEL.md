# Experimento — processamento paralelo de cupons

> **Experimental. Não publicado como release.** A versão sequencial estável 0.3.1 e a branch `main` permanecem inalteradas.

Arquivo experimental: [`mercadolivre-coupon-activator-parallel.js`](./mercadolivre-coupon-activator-parallel.js)

## Objetivo

Dividir a faixa de páginas do Mercado Livre em blocos independentes e distribuir esses blocos entre um conjunto limitado de trabalhadores (iframes).

**Configuração inicial: 10 blocos e 5 trabalhadores simultâneos.**

Cada trabalhador executa as páginas de seu bloco em sequência, mas os trabalhadores carregam/analisam páginas em paralelo. **Todas as ativações de cupons passam por uma fila global de início de clique**, que, com a configuração atual, respeita pelo menos 250 ms entre os inícios. Cada trabalhador verifica o resultado e espera pelo menos 2 segundos após o próprio clique, sem bloquear a fila global durante essa verificação. Isso evita cliques simultâneos, mas permite respostas pendentes de trabalhadores diferentes.

## Configuração

Altere o objeto `CONFIG` no início do script.

**Parâmetros da branch atual (após personalização):** os intervalos globais estão em 250 ms. A validação aceita inteiros positivos e alerta para valores muito baixos, sem substituí-los. Configurar intervalos agressivos pode levar o Mercado Livre a limitar ou recusar requisições; o script não contorna essas restrições.

| Parâmetro | Valor inicial | Função |
| --- | ---: | --- |
| `numeroBlocos` | **10** | Quantidade desejada de partes do intervalo |
| `numeroProcessos` | **5** | Quantidade máxima de iframes/trabalhadores |
| `paginaInicial` | `1` | Primeira página incluída |
| `paginaFinal` | `null` | Tenta localizar a última página explicitamente; se não conseguir, solicita um número |
| `intervaloGlobalCliquesMs` | **250** | Intervalo mínimo global entre **inícios** de ativações, independente da confirmação do trabalhador anterior |
| `intervaloGlobalNavegacoesMs` | **250** | Intervalo mínimo global entre inícios de navegações |
| `esperaAposCliqueMs` | **2000** | Tempo mínimo total após o clique antes de o mesmo trabalhador prosseguir; a confirmação conta nesse tempo |
| `esperaConfirmacaoMs` | **2000** | Janela para observar o resultado individual |
| `esperaAposPaginaMs` | **2000** | Estabilização do conteúdo antes de processar |
| `timeoutPaginaMs` | `45000` | Tempo máximo ativo para validar uma página |
| `intervaloVerificacaoMs` | `250` | Frequência da verificação do DOM |
| `maxCuponsPorPagina` | `300` | Limite de segurança de controles por página |
| `limiteMaximoPaginas` | `500` | Limite de faixa para este experimento |

A confirmação de página verifica o indicador selecionado (ou, quando ausente, combina URL e links da paginação) e conteúdo estabilizado. **Páginas com somente botões "Conferir"/"Ver cupom" são válidas**.

### Exemplo de divisão

Para `paginaInicial: 1`, `paginaFinal: 111`, `numeroBlocos: 10`:

| Bloco | Páginas |
| --- | --- |
| 1 | 1–12 |
| 2 | 13–23 |
| 3 | 24–34 |
| 4 | 35–45 |
| 5 | 46–56 |
| 6 | 57–67 |
| 7 | 68–78 |
| 8 | 79–89 |
| 9 | 90–100 |
| 10 | 101–111 |

Cinco trabalhadores começam pelos primeiros cinco blocos. Ao terminar, cada trabalhador assume o próximo bloco ainda não iniciado.

## Como executar

1. Entre na sua conta do Mercado Livre e abra a página de todos os cupons: `https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all`.
2. Abra o console do navegador (**F12**).
3. Copie o conteúdo integral de `mercadolivre-coupon-activator-parallel.js` e execute-o no console.
4. Se a página final não for encontrada de maneira confiável, será exibida uma pergunta solicitando o número. Você também pode definir `paginaFinal` explicitamente no objeto `CONFIG` antes de executar.
5. Acompanhe os cinco painéis. Use **Pausar** ou **Fechar** na barra superior.

Comandos expostos na aba:

- `pausarCuponsParalelo()`
- `continuarCuponsParalelo()`
- `fecharCuponsParalelo()`
- `limparProgressoCuponsParalelo()` — somente após encerrar a execução.

## Retomada e cuidados

O progresso é armazenado no `localStorage` do Mercado Livre, **por página**, sob uma chave separada da versão sequencial, que inclui faixa inicial/final e número de blocos. Não armazena cookies, senhas ou tokens.

Ao executar novamente com a **mesma faixa e número de blocos**, páginas marcadas como concluídas são ignoradas. Dentro de uma página interrompida, os identificadores de cupons já tentados são ignorados para evitar repetições. Se algum controle sem identificação estável já tiver sido tentado em uma execução anterior, os demais sem identificador serão ignorados nessa retomada por precaução.

Para reprocessar toda a faixa, encerre o script e execute `limparProgressoCuponsParalelo()` antes de iniciar novamente.

### Falhas e limites

- Respostas **HTTP 401, 403 ou 429**, se observáveis pelos metadados de rede, e avisos explícitos de erro **interrompem globalmente** a automação.
- Não há tentativa de contornar autenticação, CAPTCHA, bloqueios ou limites de requisições.
- "Inconclusivo" significa apenas que não houve evidência suficiente na interface para confirmar a ativação.
- O agendador **serializa o início dos cliques** (no mínimo 250 ms de diferença com a configuração atual), mas libera a fila global sem aguardar a confirmação do clique anterior. Cada trabalhador aguarda a confirmação por até 2 s e só prossegue após pelo menos 2 s desde seu próprio clique. Assim, pode haver ativações em andamento em iframes diferentes; as recusas detectadas interrompem novas ativações, mas operações já iniciadas podem estar pendentes. **Não pressupor aceleração de 5×**.
- Cada iframe consome memória e cria atividade de rede. Cinco trabalhadores podem exigir mais recursos que a versão sequencial.
- A última página não é estimada a partir do maior número visível, porque a paginação pode ocultar páginas intermediárias e finais.
- A interface do Mercado Livre pode mudar, exigindo ajustes nos seletores.

## Testes

A workflow [Parallel experiment CI](./.github/workflows/ci-parallel.yml) usa Node.js 24 e valida sintaxe, divisão dos intervalos, parâmetros iniciais, invariantes de fila e proteções básicas.

```powershell
node --check .\mercadolivre-coupon-activator-parallel.js
node --test .\tests\parallel.test.cjs
```

**Os testes são automatizados e não representam execução autenticada do experimento no Mercado Livre.**
