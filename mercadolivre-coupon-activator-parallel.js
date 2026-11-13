// Mercado Livre Coupon Activator — experimento de processamento paralelo
// Execute no console, autenticado na página https://www.mercadolivre.com.br/cupons/filter?all=true
// Projeto independente. O script NÃO contorna bloqueios, CAPTCHA ou restrições HTTP.
(async () => {
  'use strict';

  const CONFIG = {
    numeroBlocos: 10,
    numeroProcessos: 5,
    colunasPainel: 5,
    escalaIframe: 0.7,
    paginaInicial: 1,
    paginaFinal: null, 
    intervaloGlobalCliquesMs: 250,
    intervaloGlobalNavegacoesMs: 250,
    esperaAposCliqueMs: 2000,
    esperaConfirmacaoMs: 2000,
    esperaAposPaginaMs: 2000,
    intervaloVerificacaoMs: 250,
    timeoutPaginaMs: 45000,
    timeoutDeteccaoPaginasMs: 15000,
    maxCuponsPorPagina: 300,
    limiteMaximoPaginas: 500,
    url: 'https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all'
  };

  const origem = new URL(CONFIG.url).origin;
  const urlBase = new URL(location.href);
  urlBase.searchParams.delete('page');
  urlBase.hash = '';
  if (location.origin !== origem) {
    console.error('[ML Parallel] Abra a página de cupons antes de executar.');
    return;
  }
  // Permitir intervalos configuráveis menores que os valores sugeridos.
  // Validar apenas o tipo e a faixa, sem avisos para intervalos baixos.
  function validarConfig(config) {
    const erros = [];
    const inteiroEntre = (nome, minimo, maximo = Number.MAX_SAFE_INTEGER) => {
      const valor = config[nome];
      if (!Number.isSafeInteger(valor) || valor < minimo || valor > maximo)
        erros.push(nome + ': esperado inteiro entre ' + minimo + ' e ' + maximo);
    };
    inteiroEntre('limiteMaximoPaginas', 1);
    inteiroEntre('numeroBlocos', 1, config.limiteMaximoPaginas);
    inteiroEntre('numeroProcessos', 1, 20);
    inteiroEntre('colunasPainel', 1, 10);
    if (typeof config.escalaIframe !== 'number' || !Number.isFinite(config.escalaIframe) ||
        config.escalaIframe < 0.4 || config.escalaIframe > 1)
      erros.push('escalaIframe: esperado número entre 0.4 e 1');
    inteiroEntre('paginaInicial', 1, config.limiteMaximoPaginas);
    if (config.paginaFinal !== null) {
      inteiroEntre('paginaFinal', config.paginaInicial, config.limiteMaximoPaginas);
    }
    for (const nome of [
      'intervaloGlobalCliquesMs', 'intervaloGlobalNavegacoesMs',
      'esperaAposCliqueMs', 'esperaConfirmacaoMs',
      'esperaAposPaginaMs', 'intervaloVerificacaoMs', 'timeoutPaginaMs',
      'timeoutDeteccaoPaginasMs'
    ]) inteiroEntre(nome, 1);
    inteiroEntre('maxCuponsPorPagina', 1);
    return erros;
  }

  const errosConfig = validarConfig(CONFIG);
  if (errosConfig.length) {
    console.error('[ML Parallel] Parâmetros inválidos no objeto CONFIG:', errosConfig);
    return;
  }
  try { window.fecharCuponsParalelo?.(); } catch (_) {}
  document.getElementById('ml-cupons-parallel-root')?.remove();

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const texto = el => String(el?.innerText || el?.textContent || '')
    .replace(/\s+/g, ' ').trim();
  const seletorCartao = [
    '[data-testid*="coupon-card"]', '[class*="coupon-card"]',
    '[class*="coupon-item"]', '[class*="coupon-list__item"]'
  ].join(', ');
  const seletorControles = 'button, a, [role="button"]';
  const inicio = performance.now();
  const estado = {
    encerrado: false, fechado: false, pausado: false, finalizado: false, motivo: '',
    pausaInicio: null, pausaAcumulada: 0, paginaFinal: null,
    blocos: [], trabalhadores: [], paginasConcluidas: 0, cliques: 0,
    confirmados: 0, inconclusivos: 0, ignorados: 0, falhas: 0, recusados: 0,
    filas: { clique: Promise.resolve(), navegacao: Promise.resolve() },
    proximas: { clique: 0, navegacao: 0 }, registro: null, chaveRegistro: null
  };

  function dividirEmBlocos(inicio, fim, quantidade) {
    if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(fim) ||
        !Number.isSafeInteger(quantidade) || inicio < 1 || fim < inicio || quantidade < 1)
      throw new Error('Faixa de páginas ou quantidade de blocos inválida.');
    const total = fim - inicio + 1;
    const n = Math.min(total, quantidade);
    const tamanho = Math.floor(total / n);
    const extra = total % n;
    let atual = inicio;
    return Array.from({ length: n }, (_, id) => {
      const qtde = tamanho + (id < extra ? 1 : 0);
      const bloco = { id: id + 1, inicio: atual, fim: atual + qtde - 1,
        proxima: atual, status: 'aguardando', paginas: 0 };
      atual += qtde;
      return bloco;
    });
  }

  function urlPagina(numero) {
    // Usar a mesma lista e os mesmos filtros da aba de origem.
    const url = new URL(urlBase.href);
    if (numero > 1) url.searchParams.set('page', String(numero));
    return url.href;
  }

  function ativoMs() {
    return performance.now() - inicio - estado.pausaAcumulada -
      (estado.pausaInicio === null ? 0 : performance.now() - estado.pausaInicio);
  }

  async function aguardarAtivo() {
    while (estado.pausado && !estado.encerrado) await sleep(100);
    return !estado.encerrado;
  }

  async function esperar(ms) {
    const ini = ativoMs();
    while (!estado.encerrado) {
      if (!(await aguardarAtivo())) return false;
      const restante = ms - (ativoMs() - ini);
      if (restante <= 0) return true;
      await sleep(Math.min(restante, 100));
    }
    return false;
  }

  // Uma fila compartilhada espaça globalmente os INÍCIOS dos cliques.
  // A verificação e a espera pós-clique ocorrem em cada trabalhador,
  // fora dessa fila. Assim, o intervalo global não vira 3–5 segundos.
  function agendar(tipo, intervalo, acao) {
    const operacao = estado.filas[tipo].then(async () => {
      if (!(await aguardarAtivo())) return null;
      const restante = estado.proximas[tipo] - ativoMs();
      if (restante > 0 && !(await esperar(restante))) return null;
      if (estado.encerrado) return null;
      estado.proximas[tipo] = ativoMs() + intervalo;
      return acao();
    });
    estado.filas[tipo] = operacao.catch(() => {});
    return operacao;
  }

  function el(tag, css = '', label = '') {
    const item = document.createElement(tag);
    item.style.cssText = css;
    if (label) item.textContent = label;
    return item;
  }

  const raiz = el('div', 'position:fixed;inset:0;z-index:2147483647;background:#f7f7f7;' +
    'display:flex;flex-direction:column;color:#222;font:13px Arial,sans-serif;');
  raiz.id = 'ml-cupons-parallel-root';
  const barra = el('div', 'background:#fff159;border-bottom:1px solid #999;padding:10px;' +
    'display:flex;align-items:center;gap:10px;flex-wrap:wrap;');
  const titulo = el('strong', '', 'ML Cupons — experimento paralelo');
  const resumo = el('span', 'flex:1;min-width:300px;', 'Inicializando...');
  const pausa = el('button', 'padding:7px 12px;cursor:pointer;', 'Pausar');
  const fecharBtn = el('button', 'padding:7px 12px;cursor:pointer;', 'Fechar');
  barra.append(titulo, resumo, pausa, fecharBtn);
  const colunas = Math.min(CONFIG.numeroProcessos, CONFIG.colunasPainel);
  const quadros = el('div', 'display:grid;grid-template-columns:repeat(' +
    colunas + ',minmax(0,1fr));grid-auto-rows:minmax(0,1fr);' +
    'gap:6px;padding:6px;overflow:hidden;flex:1;min-height:0;');
  raiz.append(barra, quadros);
  // A página principal permanece visível durante o pré-processamento.
  // O painel e os cinco iframes são inseridos APENAS após definir os blocos.

  function atualizar() {
    if (estado.fechado) return;
    const concluido = estado.blocos.filter(b => b.status === 'concluído').length;
    const segundos = Math.floor(ativoMs() / 1000);
    const tempo = String(Math.floor(segundos / 60)).padStart(2, '0') + ':' +
      String(segundos % 60).padStart(2, '0');
    resumo.textContent = (estado.encerrado ? 'Encerrado' : estado.pausado ? 'Pausado' : 'Executando') +
      ' | ' + concluido + '/' + estado.blocos.length + ' blocos | ' +
      estado.paginasConcluidas + ' pág. | ' + estado.cliques + ' tent. | ' +
      estado.confirmados + ' confirm. | ' + estado.inconclusivos + ' inconcl. | ' +
      estado.recusados + ' recusas | ' + estado.falhas + ' falhas | ' + tempo +
      (estado.motivo ? ' | ' + estado.motivo : '');
    pausa.textContent = estado.pausado ? 'Continuar' : 'Pausar';
    pausa.disabled = estado.encerrado;
    for (const bloco of estado.blocos) {
      if (bloco.statusEl) bloco.statusEl.textContent =
        'Bloco ' + bloco.id + ' | ' + bloco.inicio + '–' + bloco.fim +
        ' | ' + bloco.status + ' | ' + bloco.paginas + ' pág.';
    }
  }

  function interromper(motivo) {
    if (estado.encerrado) return;
    estado.encerrado = true;
    estado.motivo = motivo;
    console.warn('[ML Parallel] Interrompido:', motivo);
    atualizar();
  }

  function fechar() {
    interromper('Encerrado pelo usuário.');
    estado.fechado = true;
    raiz.remove();
    for (const nome of ['fecharCuponsParalelo', 'pausarCuponsParalelo',
      'continuarCuponsParalelo', 'limparProgressoCuponsParalelo']) {
      if (window[nome]) delete window[nome];
    }
  }

  function alternarPausa() {
    if (estado.encerrado) return;
    if (estado.pausado) {
      estado.pausaAcumulada += performance.now() - estado.pausaInicio;
      estado.pausaInicio = null;
      estado.pausado = false;
    } else {
      estado.pausado = true;
      estado.pausaInicio = performance.now();
    }
    atualizar();
  }

  function salvar() {
    if (!estado.chaveRegistro || !estado.registro) return;
    try { localStorage.setItem(estado.chaveRegistro, JSON.stringify(estado.registro)); }
    catch (erro) { console.warn('[ML Parallel] Não foi possível salvar progresso:', erro); }
  }

  function limparProgresso() {
    if (!estado.encerrado) {
      console.warn('[ML Parallel] Encerre a execução antes de limpar o progresso.');
      return;
    }
    if (!estado.chaveRegistro) return;
    localStorage.removeItem(estado.chaveRegistro);
    console.log('[ML Parallel] Progresso local removido.');
  }

  window.fecharCuponsParalelo = fechar;
  window.pausarCuponsParalelo = () => { if (!estado.pausado) alternarPausa(); };
  window.continuarCuponsParalelo = () => { if (estado.pausado) alternarPausa(); };
  window.limparProgressoCuponsParalelo = limparProgresso;
  pausa.addEventListener('click', alternarPausa);
  fecharBtn.addEventListener('click', fechar);

  function obterDocumento(frame) {
    const doc = frame.contentDocument;
    if (!doc?.body) throw new Error('Documento do iframe indisponível.');
    const url = new URL(doc.location.href);
    if (url.origin !== origem || !/^\/cupons(?:\/|$)/.test(url.pathname))
      throw new Error('Página fora do domínio de cupons: ' + url.href);
    return doc;
  }

  function numeroSelecionado(doc) {
    for (const seletor of [
      '.andes-pagination [aria-current="page"]',
      '.andes-pagination__button--current',
      '.andes-pagination__button--selected',
      '.andes-pagination [aria-selected="true"]',
      '[class*="pagination"] [aria-current="page"]',
      '[class*="pagination"] [aria-selected="true"]'
    ]) {
      const x = doc.querySelector(seletor);
      const match = texto(x).match(/^\s*(\d+)\s*$/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function numeroDaUrl(doc) {
    const valor = new URL(doc.location.href).searchParams.get('page');
    return valor && /^[1-9]\d*$/.test(valor) ? Number(valor) : 1;
  }

  function paginaCorreta(doc, esperada) {
    const selecionado = numeroSelecionado(doc);
    if (selecionado !== null) return selecionado === esperada;
    if (numeroDaUrl(doc) !== esperada) return false;
    if (esperada === 1) return true;
    return [...doc.querySelectorAll('a[rel="next"], a[rel="prev"], .andes-pagination a')]
      .some(a => {
        const href = a.getAttribute('href');
        if (!href) return false;
        try {
          const destino = Number(new URL(href, doc.location.href).searchParams.get('page'));
          return destino === esperada + 1 || destino === esperada - 1 ||
            destino === esperada;
        } catch (_) { return false; }
      });
  }

  function visivel(el) {
    if (!el?.isConnected || el.matches(':disabled') ||
        el.closest('[disabled],[aria-disabled="true"]')) return false;
    const s = el.ownerDocument.defaultView.getComputedStyle(el);
    return el.getClientRects().length > 0 &&
      s.display !== 'none' && s.visibility !== 'hidden';
  }

  function ativavel(el) {
    return /^(ativar|aplicar|resgatar)(\s+(cupom|agora))?$/i.test(texto(el));
  }

  function disponiveis(doc) {
    const cards = [...doc.querySelectorAll(seletorCartao)].filter(x => x.getClientRects().length);
    const controles = cards.length
      ? cards.flatMap(c => [...c.querySelectorAll(seletorControles)])
      : [...doc.querySelectorAll(seletorControles)];
    return [...new Set(controles)].filter(ativavel).filter(visivel)
      .filter(x => !x.querySelector(seletorControles));
  }

  function observar(doc) {
    const cards = [...doc.querySelectorAll(seletorCartao)].filter(x => x.getClientRects().length);
    const controles = [...doc.querySelectorAll(seletorControles)]
      .filter(x => x.getClientRects().length);
    const conferir = controles.filter(x => /^(conferir|ver\s+(meu\s+|o\s+)?cupom)$/i.test(texto(x)));
    const principal = doc.querySelector('main') || doc.body;
    const mensagem = texto(principal);
    const vazio = /nenhum cupom|sem cupons|n[aã]o encontramos cupons/i.test(mensagem);
    const oferta = /\b\d+\s*%\s*OFF\b|R\$\s*\d+|compra\s+m[ií]nima/i.test(mensagem);
    const carregando = Boolean(doc.querySelector('[aria-busy="true"],[role="progressbar"],.andes-spinner'));
    return { cards: cards.length, conferir: conferir.length, ativaveis: disponiveis(doc).length,
      vazio, oferta, carregando, texto: mensagem.slice(0, 450) };
  }

  function verificarAvisos(doc) {
    const aviso = [...doc.querySelectorAll(
      '[role="alert"],[role="status"],.andes-snackbar,.andes-toast,.andes-message'
    )].filter(x => x.getClientRects().length).map(texto).join(' ');
    if (/tivemos um problema|acesso negado|captcha|muitas solicita[cç][oõ]es|tente novamente mais tarde|n[aã]o foi poss[ií]vel ativar/i.test(aviso))
      throw new Error('Aviso de erro/bloqueio do site: ' + aviso.slice(0, 140));
  }

  async function aguardarPagina(frame, pagina) {
    const comeco = ativoMs();
    let assinatura = '', estavel = 0;
    let diagnostico = {};
    while (!estado.encerrado && ativoMs() - comeco < CONFIG.timeoutPaginaMs) {
      if (!(await esperar(CONFIG.intervaloVerificacaoMs))) return null;
      let doc;
      try { doc = obterDocumento(frame); } catch (erro) {
        diagnostico = { etapa: 'documento indisponível', erro: erro.message };
        continue;
      }
      if (doc.readyState === 'loading') continue;
      verificarAvisos(doc);
      if (!paginaCorreta(doc, pagina)) {
        diagnostico = { etapa: 'paginação divergente', pagina, url: doc.location.href,
          selecionado: numeroSelecionado(doc) };
        continue;
      }
      const o = observar(doc);
      diagnostico = { etapa: 'conteúdo', pagina, selecionado: numeroSelecionado(doc),
        url: doc.location.href, ...o };
      if (o.carregando || !(o.cards || o.conferir || o.ativaveis || o.vazio || o.oferta)) {
        assinatura = ''; estavel = 0; continue;
      }
      const nova = JSON.stringify([numeroSelecionado(doc), o.cards, o.conferir,
        o.ativaveis, o.vazio, o.oferta, o.texto]);
      if (assinatura !== nova) { assinatura = nova; estavel = ativoMs(); continue; }
      if (ativoMs() - estavel >= CONFIG.esperaAposPaginaMs) return doc;
    }
    if (!estado.encerrado) console.warn('[ML Parallel] Timeout carregamento:', diagnostico);
    return null;
  }

  async function navegar(trabalhador, pagina) {
    const url = urlPagina(pagina);
    const autorizado = await agendar('navegacao', CONFIG.intervaloGlobalNavegacoesMs, () => {
      trabalhador.frame.src = url;
      return true;
    });
    if (!autorizado) return null;
    return aguardarPagina(trabalhador.frame, pagina);
  }

  // A paginação pode mostrar o texto "1 de 1" em componentes não
  // relacionados. Nunca utilizar um texto genérico de <nav> como total.
  // Quando o fim não é demonstrável, solicitar a última página ao usuário.
  function paginaFinalConhecida(doc) {
    // Estrutura confirmada a partir do HTML real do Mercado Livre:
    // ul[data-andes-pagination] > li.andes-pagination__dots
    //   + li > a[data-andes-pagination-item="true"][href*="page="]
    // As reticências são três elementos <i>, desenhados pelo CSS:
    // NÃO aparecem em innerText/textContent. Isso explica o falso timeout.
    for (const lista of doc.querySelectorAll(
      'ul[data-andes-pagination="true"],ul.andes-pagination'
    )) {
      const paginas = [...lista.querySelectorAll(
        'a[data-andes-pagination-item="true"]'
      )];
      const aposReticencias = [...lista.querySelectorAll(
        'li.andes-pagination__dots + li a[data-andes-pagination-item="true"]'
      )];
      const candidato = aposReticencias.at(-1);
      // Confirmar que o candidato é o ÚLTIMO número navegável,
      // antes do botão Próximo; não confundir páginas intermediárias.
      if (!candidato || paginas.at(-1) !== candidato) continue;
      const rotulo = texto(candidato);
      if (!/^[1-9]\d*$/.test(rotulo)) continue;
      const numero = Number(rotulo);
      if (!Number.isSafeInteger(numero) ||
          numero <= CONFIG.paginaInicial ||
          numero > CONFIG.limiteMaximoPaginas) continue;
      const destino = candidato.getAttribute?.('href');
      if (!destino) continue;
      try {
        const href = new URL(destino, doc.location.href);
        const urlAtual = new URL(doc.location.href);
        const parametro = href.searchParams.get('page');
        const aria = candidato.getAttribute?.('aria-label') || '';
        const numeroAria = /p[áa]gina\s+(\d+)/i.exec(aria)?.[1];
        if (href.origin !== urlAtual.origin ||
            href.pathname !== urlAtual.pathname ||
            parametro !== rotulo ||
            (numeroAria && Number(numeroAria) !== numero)) continue;
      } catch (_) {
        continue;
      }
      console.log('[ML Parallel] Total confirmado pelos links Andes:', numero);
      return numero;
    }

    // Fallback para versões do site com outro tipo de paginador.
    // As classes externas variam conforme a versão responsiva do site.
    // Em alguns layouts há somente <ul>/<li> e nenhum ".andes-pagination".
    const raizPaginadores = [
      '.andes-pagination', '[class*="pagination"]',
      '[data-testid*="pagination"]', 'nav',
      '[role="navigation"]', 'ul', 'ol'
    ].join(',');
    const areas = new Set();
    for (const area of doc.querySelectorAll(raizPaginadores)) {
      const rotulo = texto(area);
      if (rotulo.length > 280 || !/\d/.test(rotulo)) continue;
      if (/(?:\.{3}|…)/.test(rotulo) &&
          /\bpr[oó]xim[oa]\b/i.test(rotulo)) {
        areas.add(area);
      } else if (area.querySelector(
        'a[rel="last"],[aria-label*="ltima"],' +
        '.andes-pagination__button--last a'
      )) {
        areas.add(area);
      }
    }

    // Outra variação não usa nomes de classe relacionados a paginação.
    // Localizar o controle "Próximo" e subir até o ancestral contendo
    // número de página + reticências + controle de avanço.
    const controles = doc.querySelectorAll(
      'a,button,[role="button"],span,li'
    );
    for (const controle of controles) {
      const rotulo = texto(controle);
      if (!/^pr[oó]xim[oa](?:\s*[›»>→])?$/i.test(rotulo)) continue;
      let ancestral = controle.parentElement;
      for (let profundidade = 0; ancestral && profundidade < 6;
           profundidade++, ancestral = ancestral.parentElement) {
        const valor = texto(ancestral);
        if (valor.length > 280) break;
        if (/(?:\.{3}|…)/.test(valor) && /\d/.test(valor) &&
            /\bpr[oó]xim[oa]\b/i.test(valor)) {
          areas.add(ancestral);
        }
      }
    }
    function numeroValido(numero) {
      return Number.isSafeInteger(numero) &&
        numero >= CONFIG.paginaInicial && numero <= CONFIG.limiteMaximoPaginas;
    }
    function numeroLink(elemento) {
      if (!elemento) return null;
      const href = elemento.getAttribute?.('href');
      if (href) {
        try {
          const valor = new URL(href, doc.location.href).searchParams.get('page');
          if (valor !== null && /^[1-9]\d*$/.test(valor)) return Number(valor);
        } catch (_) {}
      }
      const rotulo = texto(elemento);
      return /^\d+$/.test(rotulo) ? Number(rotulo) : null;
    }
    function proximaHabilitada(area) {
      const botao = area.querySelector(
        'li.andes-pagination__button--next a, ' +
        'li.andes-pagination__button--next button, ' +
        '.andes-pagination__button--next a, a[rel="next"], ' +
        '[data-testid="pagination-next"]'
      );
      if (!botao) return false;
      const desabilitado = botao.getAttribute?.('aria-disabled') === 'true' ||
        botao.hasAttribute?.('disabled') ||
        botao.closest?.(
          '[disabled],[aria-disabled="true"],' +
          '.andes-pagination__button--disabled'
        );
      return !desabilitado;
    }
    for (const area of areas) {
      const possuiProxima = proximaHabilitada(area);
      const fimExplicito = area.querySelector(
        'a[rel="last"], [aria-label*="ltima página"], ' +
        '[title*="ltima página"], ' +
        '.andes-pagination__button--last a, ' +
        '.andes-pagination__button--last button'
      );
      const numeroExplicito = numeroLink(fimExplicito);
      if (numeroValido(numeroExplicito) &&
          (numeroExplicito > CONFIG.paginaInicial || !possuiProxima)) {
        return numeroExplicito;
      }

      // Alguns números da paginação são spans/lis, sem link.
      // Ex.: "1 2 3 4 ... 93 Próximo". Só aceitar o número isolado
      // DEPOIS da última reticência, jamais o maior link local.
      const rotuloPaginador = texto(area);
      const posicoes = [...rotuloPaginador.matchAll(/(?:\.{3}|…)/g)];
      if (posicoes.length) {
        const ultimaReticencia = posicoes.at(-1);
        const sufixo = rotuloPaginador.slice(
          ultimaReticencia.index + ultimaReticencia[0].length
        );
        const numerosFinais = [...sufixo.matchAll(/\b([1-9]\d*)\b/g)]
          .map(x => Number(x[1]))
          .filter(numeroValido);
        // Se "Próximo" ainda está ativo, uma sequência numérica local
        // não é prova do total; somente um número isolado é confiável.
        if (numerosFinais.length === 1 &&
            numerosFinais[0] > CONFIG.paginaInicial) {
          return numerosFinais[0];
        }
        if (!possuiProxima && numerosFinais.length > 1) {
          return numerosFinais.at(-1);
        }
      }
      // Reticências sem número final isolado => total desconhecido.
    }
    return null;
  }

  // O navegador exibe a listagem original em toda a largura disponível
  // ANTES de criar painel ou iframes. Isto também mantém a paginação
  // responsiva no estado mais amplo possível dentro da janela atual.
  async function descobrirPaginaFinal() {
    const pagina = new URL(location.href);
    if (pagina.origin !== origem || !/^\/cupons(?:\/|$)/.test(pagina.pathname)) {
      throw new Error(
        'Abra a listagem principal de cupons na aba antes de executar o experimento.'
      );
    }
    console.log('[ML Parallel] Pré-processamento na página principal: ' +
      'identificando última página antes de abrir os trabalhadores.');
    const scrollAnterior = { x: window.scrollX, y: window.scrollY };
    const comeco = ativoMs();
    let ultimaObservada = null;
    let desde = null;

    try {
      // A paginação pode estar fora da área visível e ter carregamento tardio.
      window.scrollTo(0, Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      ));
      while (!estado.encerrado &&
             ativoMs() - comeco < CONFIG.timeoutDeteccaoPaginasMs) {
        if (!(await esperar(CONFIG.intervaloVerificacaoMs))) return null;
        if (document.readyState === 'loading') continue;
        const detectada = paginaFinalConhecida(document);
        if (detectada === null) {
          ultimaObservada = null;
          desde = null;
          continue;
        }
        if (ultimaObservada !== detectada) {
          ultimaObservada = detectada;
          desde = ativoMs();
          continue;
        }
        if (desde !== null &&
            ativoMs() - desde >= CONFIG.esperaAposPaginaMs) {
          console.log('[ML Parallel] Última página confirmada na aba principal:', detectada);
          return detectada;
        }
      }
    } finally {
      window.scrollTo(scrollAnterior.x, scrollAnterior.y);
    }
    const candidatos = [...document.querySelectorAll(
      '[class*="pagination"],nav,ul,ol,[role="navigation"]'
    )].map(el => ({
      elemento: el.tagName?.toLowerCase(),
      classe: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
      rotulo: texto(el).slice(0, 160)
    })).filter(x => /pr[oó]xim[oa]/i.test(x.rotulo) && /\d/.test(x.rotulo))
      .slice(0, 8);
    console.warn('[ML Parallel] Diagnóstico de paginação não reconhecida:', {
      url: location.href,
      larguraViewport: window.innerWidth,
      candidatos
    });
    return null;
  }

  function criarTrabalhador(id) {
    const box = el('div', 'display:flex;flex-direction:column;min-height:0;min-width:0;height:100%;' +
      'border:1px solid #bbb;border-radius:6px;background:white;overflow:hidden;');
    const rotulo = el('div', 'padding:6px;background:#f1f1f1;font-weight:bold;',
      'Trabalhador ' + id + ' — aguardando');
    const areaIframe = el('div', 'position:relative;flex:1;min-height:0;overflow:hidden;');
    const escala = CONFIG.escalaIframe;
    const frame = el('iframe', 'display:block;border:0;transform-origin:top left;' +
      'transform:scale(' + escala + ');width:' + (100 / escala) + '%;' +
      'height:' + (100 / escala) + '%;');
    frame.title = 'ML Cupons trabalhador ' + id;
    areaIframe.appendChild(frame);
    box.append(rotulo, areaIframe);
    quadros.appendChild(box);
    const trabalhador = { id, frame, rotulo, bloco: null };
    estado.trabalhadores.push(trabalhador);
    return trabalhador;
  }

  function chaveCupom(botao) {
    const card = botao.closest(seletorCartao);
    for (const elem of [botao, card]) {
      if (!elem) continue;
      for (const att of ['data-coupon-id', 'data-couponid',
        'data-coupon_id', 'data-voucher-id', 'data-promotion-id']) {
        const valor = elem.getAttribute(att);
        if (valor) return att + ':' + valor;
      }
    }
    return null;
  }

  function rotuloConfirmado(el) {
    return /^(ativad[oa]|resgatad[oa]|conferir(\s+(cupom|oferta))?|ver\s+(meu\s+|o\s+)?cupom)$/i
      .test(texto(el));
  }

  function resolverControle(doc, item) {
    if (item.elemento.isConnected && ativavel(item.elemento) &&
        visivel(item.elemento) &&
        (!item.chave || chaveCupom(item.elemento) === item.chave)) {
      return item.elemento;
    }
    if (!item.chave) return null;
    const candidatos = disponiveis(doc)
      .filter(x => chaveCupom(x) === item.chave);
    return candidatos.length === 1 ? candidatos[0] : null;
  }

  function sinalConfirmacao(doc, item) {
    const candidatos = [];
    if (item.elemento.isConnected && (!item.chave || chaveCupom(item.elemento) === item.chave))
      candidatos.push(item.elemento);
    if (item.chave) {
      for (const x of doc.querySelectorAll(seletorControles)) {
        if (x.isConnected && chaveCupom(x) === item.chave) candidatos.push(x);
      }
    } else if (item.cartao?.isConnected) {
      candidatos.push(...item.cartao.querySelectorAll(seletorControles));
    }
    return [...new Set(candidatos)].some(x =>
      rotuloConfirmado(x) && !item.sinaisAnteriores.has(texto(x))
    );
  }

  function statusHttp(frame, marco) {
    if (marco === null) return null;
    try {
      const perf = frame.contentWindow?.performance;
      for (const r of [...(perf?.getEntriesByType('resource') || [])].reverse()) {
        if (r.startTime + 1 < marco || !r.responseEnd) continue;
        const u = new URL(r.name);
        if (u.origin !== origem || u.pathname !== '/cupons/api/activate') continue;
        const code = Number(r.responseStatus);
        return Number.isInteger(code) && code >= 100 && code <= 599 ? code : null;
      }
    } catch (_) {}
    return null;
  }

  async function confirmarClique(trabalhador, item, marco) {
    const inicioConfirmacao = ativoMs();
    while (!estado.encerrado && ativoMs() - inicioConfirmacao < CONFIG.esperaConfirmacaoMs) {
      if (!(await esperar(CONFIG.intervaloVerificacaoMs))) return null;
      const status = statusHttp(trabalhador.frame, marco);
      if ([401, 403, 429].includes(status))
        throw new Error('Recusa HTTP ' + status + ' na ativação. Interrompido.');
      if (status >= 400) throw new Error('Falha HTTP ' + status + ' na ativação.');
      const doc = obterDocumento(trabalhador.frame);
      verificarAvisos(doc);
      if (sinalConfirmacao(doc, item)) return 'confirmado';
    }
    return 'inconclusivo';
  }

  function registroPagina(pagina) {
    const chave = String(pagina);
    if (!estado.registro.paginas[chave])
      estado.registro.paginas[chave] = { concluida: false, ids: [], semIdTentado: false };
    return estado.registro.paginas[chave];
  }

  async function processarPagina(trabalhador, pagina) {
    const salvo = registroPagina(pagina);
    if (salvo.concluida) { estado.paginasConcluidas++; return; }

    trabalhador.rotulo.textContent = 'Trabalhador ' + trabalhador.id + ' — página ' + pagina;
    const doc = await navegar(trabalhador, pagina);
    if (!doc || estado.encerrado) throw new Error('Não foi possível validar a página ' + pagina);
    const botoes = disponiveis(doc);
    if (botoes.length > CONFIG.maxCuponsPorPagina)
      throw new Error('Página ' + pagina + ' possui controles acima do limite seguro.');

    const itens = botoes.map(elemento => ({
      elemento, chave: chaveCupom(elemento), cartao: elemento.closest(seletorCartao)
    }));
    const contagem = new Map();
    for (const item of itens) if (item.chave) contagem.set(item.chave, (contagem.get(item.chave) || 0) + 1);
    // Somente retomadas precisam suprimir TODOS os controles sem identidade.
    // Durante uma execução nova, diferentes cupons sem ID ainda podem ser acionados.
    const semIdNaRetomada = salvo.semIdTentado;

    for (const item of itens) {
      if (estado.encerrado) return;
      if (!(await aguardarAtivo())) return;
      if (item.chave && contagem.get(item.chave) > 1) {
        estado.ignorados++; continue;
      }
      if (item.chave && salvo.ids.includes(item.chave)) {
        estado.ignorados++; continue;
      }
      if (!item.chave && semIdNaRetomada) {
        estado.ignorados++; continue;
      }
      if (!item.elemento.isConnected || !visivel(item.elemento) || !ativavel(item.elemento)) {
        estado.ignorados++; continue;
      }
      item.sinaisAnteriores = new Set(
        [item.elemento, ...(item.cartao?.querySelectorAll(seletorControles) || [])]
          .filter(rotuloConfirmado).map(texto)
      );

      const clique = await agendar('clique', CONFIG.intervaloGlobalCliquesMs, () => {
        if (estado.encerrado) return null;
        const docAtual = obterDocumento(trabalhador.frame);
        if (!paginaCorreta(docAtual, pagina))
          throw new Error('Página mudou antes de ativar cupom: ' + pagina);
        verificarAvisos(docAtual);
        const atual = resolverControle(docAtual, item);
        if (!atual) {
          estado.ignorados++;
          atualizar();
          return { ignorado: true };
        }

        // Confirmar estado anterior no instante do clique, após a espera global.
        item.elemento = atual;
        item.sinaisAnteriores = new Set(
          [atual, ...(item.cartao?.isConnected
            ? item.cartao.querySelectorAll(seletorControles) : [])]
            .filter(rotuloConfirmado).map(texto)
        );

        // Persistir ANTES do clique para impedir duplicação na retomada.
        if (item.chave && !salvo.ids.includes(item.chave)) salvo.ids.push(item.chave);
        else if (!item.chave) salvo.semIdTentado = true;
        salvar();

        const perf = trabalhador.frame.contentWindow?.performance;
        const marco = perf?.now?.() ?? null;
        const momentoClique = ativoMs();
        atual.click();
        estado.cliques++;
        atualizar();
        return { marco, momentoClique };
      });

      if (clique === null) {
        if (estado.encerrado) return;
        continue;
      }
      if (clique.ignorado) continue;

      // Cada trabalhador aguarda/valida seu próprio clique independentemente;
      // a fila global libera outro trabalhador após o intervalo configurado.
      const resultado = await confirmarClique(trabalhador, item, clique.marco);
      if (resultado === 'confirmado') estado.confirmados++;
      else if (resultado === 'inconclusivo') estado.inconclusivos++;
      atualizar();

      // Espera MÍNIMA total de 2 s após o clique daquele trabalhador;
      // o tempo já gasto na confirmação entra nessa conta.
      const restanteAposClique =
        CONFIG.esperaAposCliqueMs - (ativoMs() - clique.momentoClique);
      if (restanteAposClique > 0 && !(await esperar(restanteAposClique))) return;

    }
    if (estado.encerrado) return;
    salvo.concluida = true;
    salvar();
    estado.paginasConcluidas++;
    atualizar();
  }

  let proximoBloco = 0;
  async function executarTrabalhador(trabalhador) {
    while (!estado.encerrado) {
      const bloco = estado.blocos[proximoBloco++];
      if (!bloco) return;
      trabalhador.bloco = bloco;
      bloco.status = 'executando';
      atualizar();
      try {
        for (let pagina = bloco.inicio; pagina <= bloco.fim; pagina++) {
          if (estado.encerrado) return;
          bloco.proxima = pagina;
          await processarPagina(trabalhador, pagina);
          if (!estado.encerrado) bloco.paginas++;
          atualizar();
        }
        if (estado.encerrado) return;
        bloco.status = 'concluído';
        trabalhador.rotulo.textContent = 'Trabalhador ' + trabalhador.id +
          ' — bloco ' + bloco.id + ' concluído';
        atualizar();
      } catch (erro) {
        bloco.status = 'interrompido';
        estado.falhas++;
        if (/HTTP\s+(401|403|429|[45]\d\d)/i.test(erro.message)) estado.recusados++;
        interromper('Bloco ' + bloco.id + ': ' + erro.message);
        return;
      }
    }
  }

  try {
    // 1. Examinar a listagem principal em largura total.
    // 2. Calcular as faixas; SÓ ENTÃO criar painel e iframes.
    let paginaFinal = CONFIG.paginaFinal;
    if (paginaFinal === null) {
      paginaFinal = await descobrirPaginaFinal();
      if (estado.encerrado) return;
      if (paginaFinal === null) {
        console.log('[ML Parallel] Total não confirmado na página principal. ' +
          'Solicitando número antes de criar os trabalhadores.');
        const valor = prompt(
          'Não foi possível confirmar a última página automaticamente.\n' +
          'Informe o número da última página para criar os blocos:', ''
        );
        if (valor === null) throw new Error('Cancelado: última página não informada.');
        if (!/^[1-9]\d*$/.test(valor.trim()))
          throw new Error('Última página inválida: informe um número inteiro positivo.');
        paginaFinal = Number(valor.trim());
      }
    }
    if (!Number.isSafeInteger(paginaFinal) || paginaFinal < CONFIG.paginaInicial ||
        paginaFinal > CONFIG.limiteMaximoPaginas)
      throw new Error('Última página inválida. Informe CONFIG.paginaFinal manualmente.');

    estado.paginaFinal = paginaFinal;
    estado.blocos = dividirEmBlocos(CONFIG.paginaInicial, paginaFinal, CONFIG.numeroBlocos);
    console.log('[ML Parallel] Pré-processamento concluído:', {
      totalPaginas: paginaFinal,
      numeroBlocos: estado.blocos.length,
      numeroProcessos: Math.min(CONFIG.numeroProcessos, estado.blocos.length)
    });
    // Evitar retomar cupons de uma listagem com filtros diferentes.
    const filtroAtual = new URL(urlBase.href);
    filtroAtual.searchParams.sort();
    const origemFiltro = filtroAtual.pathname + filtroAtual.search;
    estado.chaveRegistro = 'ml-coupon-activator:parallel:v2:' +
      encodeURIComponent(origemFiltro) + ':' +
      CONFIG.paginaInicial + '-' + paginaFinal + ':' + estado.blocos.length;

    let registroAnterior = null;
    try { registroAnterior = JSON.parse(localStorage.getItem(estado.chaveRegistro) || 'null'); }
    catch (_) {}
    estado.registro = registroAnterior &&
      registroAnterior.versao === 'parallel-v2' &&
      registroAnterior.origemFiltro === origemFiltro &&
      registroAnterior.paginaInicial === CONFIG.paginaInicial &&
      registroAnterior.paginaFinal === paginaFinal &&
      registroAnterior.blocos === estado.blocos.length &&
      registroAnterior.paginas && typeof registroAnterior.paginas === 'object'
      ? registroAnterior
      : { versao: 'parallel-v2', origemFiltro,
          paginaInicial: CONFIG.paginaInicial,
          paginaFinal, blocos: estado.blocos.length, paginas: {} };

    // Nunca redimensionar a página antes de obter o total.
    const numeroTrabalhadores = Math.min(CONFIG.numeroProcessos, estado.blocos.length);
    document.body.appendChild(raiz);
    const trabalhadores = Array.from({ length: numeroTrabalhadores },
      (_, i) => criarTrabalhador(i + 1));

    console.log('[ML Parallel] Plano:', {
      numeroBlocos: estado.blocos.length,
      processos: trabalhadores.length,
      intervaloGlobalCliquesMs: CONFIG.intervaloGlobalCliquesMs,
      intervaloGlobalNavegacoesMs: CONFIG.intervaloGlobalNavegacoesMs,
      urlDaListagem: urlBase.href,
      faixas: estado.blocos.map(x => ({ bloco: x.id, de: x.inicio, ate: x.fim }))
    });
    atualizar();
    await Promise.all(trabalhadores.map(executarTrabalhador));
    if (!estado.encerrado) {
      estado.finalizado = true;
      estado.encerrado = true;
      estado.motivo = 'Todos os blocos foram processados.';
      console.log('[ML Parallel] Concluído:', {
        paginas: estado.paginasConcluidas, tentativas: estado.cliques,
        confirmados: estado.confirmados, inconclusivos: estado.inconclusivos,
        ignorados: estado.ignorados, falhas: estado.falhas
      });
    }
    atualizar();
  } catch (erro) {
    estado.falhas++;
    interromper(erro.message);
  }
})();
