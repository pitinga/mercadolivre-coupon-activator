// Mercado Livre - Ativar cupons de todas as páginas
// Com página inicial e pausa/continuação.
//
// COMO USAR
// 1. Faça login no Mercado Livre.
// 2. Abra:
//    https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all
// 3. Abra F12 > Console, cole todo este script e pressione Enter.
// 4. Informe a página inicial. Enter usa a página 1.
// 5. Use "Pausar/Continuar" ou ESC para pausar.
// 6. Use "Fechar" para encerrar e remover o painel.
//
// A retomada funciona enquanto o painel e a aba permanecerem abertos.
// Não há persistência após atualizar ou fechar a aba.
// Os contadores representam TENTATIVAS, não ativações confirmadas.

(async () => {
  'use strict';

  const CONFIG = {
    url: 'https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all',
    maxPaginas: 200,
    maxCuponsPorPagina: 300,
    intervaloCliquesMs: 650,
    esperaAposPaginaMs: 1400,
    esperaAposCuponsMs: 1100,
    timeoutPrimeiraPaginaMs: 25000,
    timeoutMudancaPaginaMs: 16000
  };

  const origem = new URL(CONFIG.url).origin;

  if (location.origin !== origem) {
    console.error(
      `[ML Cupons] Abra ${CONFIG.url} antes de executar o script.`
    );
    return;
  }

  const entrada = prompt(
    'Começar em qual página?\n\n' +
    'As páginas anteriores serão percorridas sem ativar cupons.\n' +
    'Pressione Enter para começar na página 1.',
    '1'
  );

  if (entrada === null) return;

  const paginaInicial = Number(entrada.trim() || '1');

  if (
    !Number.isSafeInteger(paginaInicial) ||
    paginaInicial < 1 ||
    paginaInicial > CONFIG.maxPaginas
  ) {
    console.error(
      `[ML Cupons] Informe uma página inteira entre 1 e ${CONFIG.maxPaginas}.`
    );
    return;
  }

  // Encerra uma instância anterior antes de iniciar outra.
  try {
    window.fecharCupons?.();
  } catch (_) {}

  document.getElementById('cupom-iframe-container')?.remove();

  const estado = {
    encerrado: false,
    finalizado: false,
    pausado: false,
    pausaInicio: null,
    pausaAcumuladaMs: 0,
    paginaAtual: 1,
    paginasIniciadas: 0,
    paginasConcluidas: 0,
    cliques: 0,
    falhas: 0,
    motivo: '',
    ultimaMensagem: 'Iniciando...'
  };

  const dormir = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const texto = el =>
    String(el?.innerText || el?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

  function tempoAtivo() {
    const agora = performance.now();

    const pausaAtual = estado.pausaInicio === null
      ? 0
      : agora - estado.pausaInicio;

    return agora - estado.pausaAcumuladaMs - pausaAtual;
  }

  async function aguardarExecucao() {
    while (estado.pausado && !estado.encerrado) {
      await dormir(100);
    }

    return !estado.encerrado;
  }

  async function esperar(ms) {
    const inicio = tempoAtivo();

    while (!estado.encerrado) {
      if (!(await aguardarExecucao())) return false;

      const restante = ms - (tempoAtivo() - inicio);

      if (restante <= 0) return true;

      await dormir(Math.min(100, restante));
    }

    return false;
  }

  const container = document.createElement('div');
  container.id = 'cupom-iframe-container';
  container.style.cssText = `
    position:fixed;
    inset:0;
    z-index:2147483647;
    background:#fff;
    display:flex;
    flex-direction:column;
  `;

  const painel = document.createElement('div');
  painel.style.cssText = `
    flex:none;
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    align-items:center;
    padding:10px;
    background:#fff159;
    border-bottom:1px solid #bbb;
    color:#222;
    font:13px Arial,sans-serif;
  `;

  const titulo = document.createElement('strong');
  titulo.textContent = 'ML Cupons';

  const informacao = document.createElement('span');
  informacao.style.cssText = 'flex:1;min-width:220px;';
  informacao.textContent = 'Iniciando...';

  const botaoPausa = document.createElement('button');
  botaoPausa.textContent = 'Pausar';

  const botaoFechar = document.createElement('button');
  botaoFechar.textContent = 'Fechar';

  for (const botao of [botaoPausa, botaoFechar]) {
    botao.style.cssText = `
      padding:7px 12px;
      border:1px solid #999;
      border-radius:5px;
      background:#fff;
      color:#222;
      cursor:pointer;
      font:13px Arial,sans-serif;
    `;
  }

  const frame = document.createElement('iframe');
  frame.id = 'cupom-iframe';
  frame.title = 'Cupons do Mercado Livre';
  frame.style.cssText = `
    flex:1;
    min-height:0;
    width:100%;
    border:0;
    display:block;
    background:#fff;
  `;

  painel.append(titulo, informacao, botaoPausa, botaoFechar);
  container.append(painel, frame);

  function atualizarPainel() {
    if (estado.encerrado) return;

    const prefixo = estado.finalizado
      ? 'Encerrado'
      : estado.pausado
        ? 'Pausado'
        : 'Executando';

    informacao.textContent =
      `${prefixo} | Página ${estado.paginaAtual} | ` +
      `${estado.cliques} tentativa(s) | ${estado.ultimaMensagem}`;

    botaoPausa.textContent = estado.finalizado
      ? 'Encerrado'
      : estado.pausado
        ? 'Continuar'
        : 'Pausar';

    botaoPausa.disabled = estado.finalizado;
  }

  function mostrar(mensagem) {
    estado.ultimaMensagem = mensagem;
    atualizarPainel();
    console.log(`[ML Cupons] ${mensagem}`);
  }

  function pausar() {
    if (
      estado.encerrado ||
      estado.finalizado ||
      estado.pausado
    ) {
      return;
    }

    estado.pausado = true;
    estado.pausaInicio = performance.now();
    atualizarPainel();

    console.log(
      `[ML Cupons] Pausado na página ${estado.paginaAtual}.`
    );
  }

  function continuar() {
    if (
      estado.encerrado ||
      estado.finalizado ||
      !estado.pausado
    ) {
      return;
    }

    estado.pausaAcumuladaMs +=
      performance.now() - estado.pausaInicio;

    estado.pausaInicio = null;
    estado.pausado = false;
    atualizarPainel();

    console.log(
      `[ML Cupons] Continuando na página ${estado.paginaAtual}.`
    );
  }

  function alternarPausa() {
    if (estado.pausado) continuar();
    else pausar();
  }

  function teclaParar(evento) {
    if (evento.key === 'Escape') pausar();
  }

  let documentoComTecla = null;

  function registrarTeclaNoFrame() {
    try {
      const doc = frame.contentDocument;

      if (!doc || doc === documentoComTecla) return;

      documentoComTecla?.removeEventListener(
        'keydown',
        teclaParar,
        true
      );

      doc.addEventListener('keydown', teclaParar, true);
      documentoComTecla = doc;
    } catch (_) {}
  }

  function fechar() {
    estado.encerrado = true;

    if (!estado.finalizado) {
      estado.motivo = 'Encerrado manualmente';
    }

    container.remove();

    window.removeEventListener('keydown', teclaParar, true);
    frame.removeEventListener('load', registrarTeclaNoFrame);

    try {
      documentoComTecla?.removeEventListener(
        'keydown',
        teclaParar,
        true
      );
    } catch (_) {}

    const funcoes = {
      pararCupons: pausar,
      pausarCupons: pausar,
      continuarCupons: continuar,
      fecharCupons: fechar
    };

    for (const [nome, referencia] of Object.entries(funcoes)) {
      if (window[nome] === referencia) {
        delete window[nome];
      }
    }
  }

  window.pararCupons = pausar;
  window.pausarCupons = pausar;
  window.continuarCupons = continuar;
  window.fecharCupons = fechar;

  window.addEventListener('keydown', teclaParar, true);
  frame.addEventListener('load', registrarTeclaNoFrame);

  botaoPausa.addEventListener('click', alternarPausa);
  botaoFechar.addEventListener('click', fechar);

  function documento() {
    try {
      const doc = frame.contentDocument;

      if (!doc?.body) {
        throw new Error('Documento ainda não carregado.');
      }

      const endereco = new URL(doc.location.href);

      if (
        endereco.origin !== origem ||
        !/^\/cupons(?:\/|$)/.test(endereco.pathname)
      ) {
        throw new Error(
          `Endereço inesperado: ${endereco.href}. Verifique o login.`
        );
      }

      return doc;
    } catch (erro) {
      throw new Error(
        'Não foi possível acessar a página de cupons no iframe. ' +
        `Detalhe: ${erro.message}`
      );
    }
  }

  function visivelEHabilitado(el) {
    if (!el?.isConnected || el.matches(':disabled')) return false;

    if (
      el.closest(
        '[disabled], [aria-disabled="true"], ' +
        '.andes-pagination__button--disabled, ' +
        '.andes-button--disabled'
      )
    ) {
      return false;
    }

    const estilo =
      el.ownerDocument.defaultView.getComputedStyle(el);

    return (
      estilo.display !== 'none' &&
      estilo.visibility !== 'hidden' &&
      estilo.visibility !== 'collapse' &&
      el.getClientRects().length > 0
    );
  }

  function botoesDeCupons() {
    return [
      ...documento().querySelectorAll('button, a, [role="button"]')
    ]
      .filter(el =>
        /^(?:aplicar|ativar|resgatar)(?:\s+(?:cupom|agora))?$/i
          .test(texto(el))
      )
      .filter(el => !el.querySelector('button, a, [role="button"]'))
      .filter(visivelEHabilitado);
  }

  function numeroPagina(doc) {
    const seletores = [
      '.andes-pagination [aria-current="page"]',
      '.andes-pagination__button--current',
      '.andes-pagination__button--selected',
      '[class*="pagination"] [aria-current="page"]',
      '[aria-current="page"]'
    ];

    for (const seletor of seletores) {
      const el = doc.querySelector(seletor);
      const n = texto(el).match(/\b\d+\b/);

      if (n) return Number(n[0]);
    }

    return null;
  }

  const seletorCartao = [
    '[data-testid*="coupon-card"]',
    '[class*="coupon-card"]',
    '[class*="coupon-item"]',
    '[class*="coupon-list__item"]'
  ].join(', ');

  function fotografiaPagina() {
    const doc = documento();

    const cartoes = [...doc.querySelectorAll(seletorCartao)]
      .filter(el => el.getClientRects().length > 0);

    const conteudo = cartoes.length
      ? cartoes
          .slice(0, 35)
          .map(el => texto(el).slice(0, 400))
          .join('|')
      : texto(doc.querySelector('main') || doc.body).slice(0, 7000);

    return {
      url: doc.location.href.split('#')[0],
      numero: numeroPagina(doc),
      conteudo
    };
  }

  function paginaDiferente(antes, depois) {
    return (
      antes.url !== depois.url ||
      (
        antes.numero !== null &&
        depois.numero !== null &&
        antes.numero !== depois.numero
      ) ||
      (
        Boolean(antes.conteudo && depois.conteudo) &&
        antes.conteudo !== depois.conteudo
      )
    );
  }

  function identificadorPagina(foto) {
    if (foto.numero !== null) return `pagina:${foto.numero}`;

    return JSON.stringify([foto.url, foto.conteudo]);
  }

  function encontrarProxima() {
    const doc = documento();

    const seletores = [
      'li.andes-pagination__button--next a',
      'li.andes-pagination__button--next button',
      '.andes-pagination__button--next a',
      '.andes-pagination__button--next button',
      'a[rel="next"]',
      '[data-testid="pagination-next"]',
      '[data-testid*="pagination-next"]',
      '[class*="pagination"] [class*="next"] a',
      '[class*="pagination"] [class*="next"] button'
    ];

    for (const seletor of seletores) {
      for (const el of doc.querySelectorAll(seletor)) {
        if (visivelEHabilitado(el)) return el;
      }
    }

    const areas = [
      ...doc.querySelectorAll(
        'nav, .andes-pagination, [class*="pagination"]'
      )
    ];

    const vistos = new Set();

    for (const area of areas) {
      for (
        const el of area.querySelectorAll(
          'a, button, [role="button"]'
        )
      ) {
        if (vistos.has(el)) continue;
        vistos.add(el);

        const rotulo = [
          texto(el),
          el.getAttribute('aria-label'),
          el.getAttribute('title')
        ].filter(Boolean).join(' ');

        if (
          /\b(pr[oó]xim[ao]|next|avan[cç]ar|seguinte)\b/i.test(rotulo) &&
          visivelEHabilitado(el)
        ) {
          return el;
        }
      }
    }

    return null;
  }

  async function aguardarOutraPagina(anterior) {
    const inicio = tempoAtivo();

    while (
      !estado.encerrado &&
      tempoAtivo() - inicio < CONFIG.timeoutMudancaPaginaMs
    ) {
      if (!(await esperar(300))) return false;

      let atual;

      try {
        atual = fotografiaPagina();
      } catch (_) {
        continue;
      }

      if (!paginaDiferente(anterior, atual)) continue;

      if (!(await esperar(CONFIG.esperaAposPaginaMs))) return false;

      try {
        const confirmacao = fotografiaPagina();

        if (paginaDiferente(anterior, confirmacao)) {
          registrarTeclaNoFrame();
          return true;
        }
      } catch (_) {}
    }

    return false;
  }

  async function avancarPagina() {
    if (!(await aguardarExecucao())) return false;

    let proximo = encontrarProxima();
    if (!proximo) return false;

    proximo.scrollIntoView({
      block: 'center',
      behavior: 'auto'
    });

    if (!(await esperar(200))) return false;

    // Reconsulta depois da espera: a interface pode ter sido atualizada.
    proximo = encontrarProxima();

    if (!proximo) {
      throw new Error(
        'O botão Próxima ficou indisponível antes da navegação.'
      );
    }

    const anterior = fotografiaPagina();

    proximo.click();

    const mudou = await aguardarOutraPagina(anterior);

    if (estado.encerrado) return false;

    if (!mudou) {
      throw new Error(
        'Não foi possível confirmar a mudança de página. ' +
        'Processamento encerrado para evitar cliques repetidos.'
      );
    }

    const numeroDetectado = numeroPagina(documento());

    estado.paginaAtual =
      numeroDetectado ?? estado.paginaAtual + 1;

    return true;
  }

  // Usa somente identificadores explícitos do próprio botão ou cartão.
  // Na ausência deles, mantém a referência original do elemento.
  function chaveCupom(botao) {
    const cartao = botao.closest(seletorCartao);

    for (const el of [botao, cartao]) {
      if (!el) continue;

      for (
        const atributo of [
          'data-coupon-id',
          'data-couponid',
          'data-coupon_id'
        ]
      ) {
        const valor = el.getAttribute(atributo);
        if (valor) return `${atributo}:${valor}`;
      }
    }

    return null;
  }

  function resolverBotao(item) {
    if (item.elemento.isConnected) return item.elemento;
    if (!item.chave) return null;

    const candidatos = botoesDeCupons()
      .filter(botao => chaveCupom(botao) === item.chave);

    return candidatos.length === 1 ? candidatos[0] : null;
  }

  async function aplicarNaPagina() {
    if (!(await aguardarExecucao())) return false;

    const botoes = botoesDeCupons();

    if (botoes.length > CONFIG.maxCuponsPorPagina) {
      throw new Error(
        `Foram encontrados ${botoes.length} controles; ` +
        `limite seguro: ${CONFIG.maxCuponsPorPagina}.`
      );
    }

    const itens = botoes.map(elemento => ({
      elemento,
      chave: chaveCupom(elemento)
    }));

    // Se uma chave não for única, não a utiliza para reencontrar controles.
    const contagem = new Map();

    for (const item of itens) {
      if (item.chave) {
        contagem.set(
          item.chave,
          (contagem.get(item.chave) || 0) + 1
        );
      }
    }

    for (const item of itens) {
      if (item.chave && contagem.get(item.chave) !== 1) {
        item.chave = null;
      }
    }

    mostrar(
      `${itens.length} cupom(ns) disponível(is) nesta página.`
    );

    let cliquesPagina = 0;
    let ignorados = 0;

    for (let i = 0; i < itens.length; i++) {
      if (!(await aguardarExecucao())) return false;

      let botao = resolverBotao(itens[i]);

      if (!botao) {
        throw new Error(
          `O controle ${i + 1} da página ${estado.paginaAtual} ` +
          'foi recriado sem identificação estável. ' +
          'Não será usado um índice da lista para adivinhar outro cupom.'
        );
      }

      if (!visivelEHabilitado(botao)) {
        ignorados++;
        continue;
      }

      botao.scrollIntoView({
        block: 'center',
        behavior: 'auto'
      });

      if (!(await esperar(120))) return false;

      // Revalida após a espera e após uma eventual pausa.
      botao = resolverBotao(itens[i]);

      if (!botao) {
        throw new Error(
          `O controle ${i + 1} mudou antes do clique e ` +
          'não pôde ser identificado com segurança.'
        );
      }

      if (!visivelEHabilitado(botao)) {
        ignorados++;
        continue;
      }

      botao.click();

      cliquesPagina++;
      estado.cliques++;

      mostrar(
        `Item ${i + 1}/${itens.length}; ` +
        `${cliquesPagina} clique(s) nesta página.`
      );

      if (!(await esperar(CONFIG.intervaloCliquesMs))) {
        return false;
      }
    }

    if (!(await esperar(CONFIG.esperaAposCuponsMs))) {
      return false;
    }

    mostrar(
      `Página concluída: ${cliquesPagina} clique(s), ` +
      `${ignorados} controle(s) indisponível(is).`
    );

    return true;
  }

  async function carregarPrimeiraPagina() {
    mostrar('Carregando a listagem de todos os cupons...');

    frame.src = CONFIG.url;
    document.body.appendChild(container);

    const inicio = tempoAtivo();

    while (
      !estado.encerrado &&
      tempoAtivo() - inicio < CONFIG.timeoutPrimeiraPaginaMs
    ) {
      if (!(await esperar(200))) return false;

      let pronto = false;

      try {
        const doc = documento();
        pronto = doc.readyState === 'complete';
      } catch (_) {}

      if (!pronto) continue;

      if (!(await esperar(CONFIG.esperaAposPaginaMs))) return false;

      documento();
      registrarTeclaNoFrame();

      estado.paginaAtual =
        numeroPagina(documento()) ?? 1;

      return true;
    }

    if (estado.encerrado) return false;

    throw new Error(
      'Tempo limite ao carregar os cupons. ' +
      'Verifique login, bloqueio do iframe ou conexão.'
    );
  }

  try {
    if (!(await carregarPrimeiraPagina())) return;

    if (estado.paginaAtual > paginaInicial) {
      throw new Error(
        `A listagem abriu na página ${estado.paginaAtual}, ` +
        `posterior à página inicial solicitada (${paginaInicial}).`
      );
    }

    const passagem = new Set();

    // Chega à página inicial sem ativar cupons nas anteriores.
    while (
      !estado.encerrado &&
      estado.paginaAtual < paginaInicial
    ) {
      if (!(await aguardarExecucao())) return;

      const foto = fotografiaPagina();
      const id = identificadorPagina(foto);

      if (passagem.has(id)) {
        throw new Error(
          'Página repetida durante a navegação até a página inicial.'
        );
      }

      passagem.add(id);

      mostrar(
        `Indo à página ${paginaInicial}: ` +
        `passando pela ${estado.paginaAtual}, sem ativar cupons.`
      );

      const avancou = await avancarPagina();

      if (estado.encerrado) return;

      if (!avancou) {
        throw new Error(
          `Não foi possível chegar à página ${paginaInicial}. ` +
          `Sem Próxima habilitado na página ${estado.paginaAtual}.`
        );
      }

      if (estado.paginaAtual > paginaInicial) {
        throw new Error(
          'A paginação ultrapassou a página inicial solicitada.'
        );
      }
    }

    const visitadas = new Set();

    while (
      !estado.encerrado &&
      estado.paginasIniciadas < CONFIG.maxPaginas
    ) {
      if (!(await aguardarExecucao())) return;

      const fotoInicial = fotografiaPagina();
      const id = identificadorPagina(fotoInicial);

      if (visitadas.has(id)) {
        throw new Error(
          'Página repetida detectada. Proteção contra loop acionada.'
        );
      }

      visitadas.add(id);
      estado.paginasIniciadas++;

      const concluida = await aplicarNaPagina();

      if (!concluida || estado.encerrado) return;

      estado.paginasConcluidas++;

      if (!(await aguardarExecucao())) return;

      if (!encontrarProxima()) {
        estado.motivo =
          'Sem botão Próxima habilitado; fim da paginação detectada.';
        break;
      }

      if (estado.paginasIniciadas >= CONFIG.maxPaginas) {
        estado.motivo =
          `Limite de segurança de ${CONFIG.maxPaginas} páginas processadas.`;
        break;
      }

      mostrar('Página concluída. Indo para a próxima...');

      if (!(await avancarPagina())) {
        if (!estado.encerrado) {
          estado.motivo = 'Sem botão Próxima habilitado.';
        }

        break;
      }
    }

    if (!estado.motivo) {
      estado.motivo = estado.encerrado
        ? 'Encerrado manualmente'
        : 'Execução concluída';
    }
  } catch (erro) {
    estado.falhas++;
    estado.motivo = `Erro: ${erro.message}`;
    console.error('[ML Cupons]', erro);
  } finally {
    estado.finalizado = true;

    if (!estado.motivo) {
      estado.motivo = estado.encerrado
        ? 'Encerrado manualmente'
        : 'Execução encerrada';
    }

    console.log('[ML Cupons] RESUMO:', {
      paginaInicialSolicitada: paginaInicial,
      ultimaPagina: estado.paginaAtual,
      paginasIniciadas: estado.paginasIniciadas,
      paginasConcluidas: estado.paginasConcluidas,
      tentativasDeClique: estado.cliques,
      ativacoesConfirmadas: 'não verificadas individualmente',
      falhas: estado.falhas,
      motivo: estado.motivo
    });

    if (!estado.encerrado) {
      mostrar(
        `${estado.paginasConcluidas} página(s) concluída(s). ` +
        estado.motivo
      );

      console.log(
        '[ML Cupons] Para remover o painel, clique em Fechar ' +
        'ou execute fecharCupons().'
      );
    }
  }
})();