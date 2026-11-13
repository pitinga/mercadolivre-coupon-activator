// Mercado Livre - Coupon Activator v0.3.0 (desenvolvimento)
// Acesso direto via &page=X, painel, retomada e confirmação conservadora.
//
// COMO USAR
// 1. Faça login no Mercado Livre.
// 2. Abra:
//    https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all
// 3. Abra F12 > Console, cole todo este script e pressione Enter.
// 4. Informe a página inicial. Enter sugere a página pendente ou 1.
// 5. Use "Pausar/Continuar" ou ESC para pausar.
// 6. Use "Fechar" para encerrar e remover o painel.
//
// O progresso é armazenado localmente, sem credenciais.
// As confirmações dependem de sinais explícitos na interface;
// tentativas não confirmadas são contabilizadas separadamente.

(async () => {
  'use strict';

  const CONFIG = {
    url: 'https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all',
    maxPaginas: 200,
    maxCuponsPorPagina: 300,
    intervaloCliquesMs: 1000,
    esperaAposCuponsMs: 600,
    esperaAposPaginaMs: 550,
    esperaConfirmacaoMs: 1800,
    timeoutPrimeiraPaginaMs: 25000,
    timeoutMudancaPaginaMs: 16000,
    intervaloVerificacaoMs: 250,
    maxTentativasNavegacao: 2,
    maxFalhasHttpConsecutivas: 2
  };

  const origem = new URL(CONFIG.url).origin;

  if (location.origin !== origem) {
    console.error(
      `[ML Cupons] Abra ${CONFIG.url} antes de executar o script.`
    );
    return;
  }

  const storageKey = 'ml-coupon-activator:progress:0.3.0';

  function novoRegistro(pagina = 1) {
    return {
      versao: '0.3.0',
      ultimaConcluida: pagina - 1,
      paginaPendente: null,
      idsTentados: [],
      semIdTentado: false,
      terminou: false,
      atualizadoEm: new Date().toISOString()
    };
  }

  function lerRegistro() {
    try {
      const valor = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!valor || valor.versao !== '0.3.0' ||
          !Number.isSafeInteger(valor.ultimaConcluida) ||
          valor.ultimaConcluida < 0 ||
          ![null, undefined].includes(valor.paginaPendente) &&
          (!Number.isSafeInteger(valor.paginaPendente) || valor.paginaPendente < 1)) {
        return null;
      }
      valor.idsTentados = Array.isArray(valor.idsTentados)
        ? valor.idsTentados.filter(v => typeof v === 'string').slice(0, CONFIG.maxCuponsPorPagina)
        : [];
      valor.semIdTentado = Boolean(valor.semIdTentado);
      return valor;
    } catch (erro) {
      console.warn('[ML Cupons] Progresso local indisponível:', erro);
      return null;
    }
  }

  const anterior = lerRegistro();
  const paginaSugerida = anterior && !anterior.terminou
    ? anterior.paginaPendente || Math.min(CONFIG.maxPaginas, anterior.ultimaConcluida + 1)
    : 1;

  const entrada = prompt(
    'Começar em qual página?\n\n' +
    'A página será aberta diretamente usando &page=X.\n' +
    'A sugestão pode ser a página pendente da última execução.\n' +
    'Informe 1 para reiniciar desde o começo.',
    String(paginaSugerida)
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

  const retomarPagina = Boolean(
    anterior && !anterior.terminou &&
    anterior.paginaPendente === paginaInicial &&
    paginaInicial > anterior.ultimaConcluida
  );
  const progresso = retomarPagina
    ? anterior : novoRegistro(paginaInicial);

  function salvarProgresso() {
    try {
      progresso.atualizadoEm = new Date().toISOString();
      localStorage.setItem(storageKey, JSON.stringify(progresso));
      return true;
    } catch (erro) {
      console.warn('[ML Cupons] Não foi possível salvar o progresso:', erro);
      return false;
    }
  }

  function iniciarPagina() {
    if (progresso.paginaPendente === estado.paginaAtual) return;
    progresso.paginaPendente = estado.paginaAtual;
    progresso.idsTentados = [];
    progresso.semIdTentado = false;
    progresso.terminou = false;
    salvarProgresso();
  }

  function registrarTentativa(item) {
    // Marcar ANTES do clique impede repetições caso a página seja recarregada.
    if (item.chave && !progresso.idsTentados.includes(item.chave)) {
      progresso.idsTentados.push(item.chave);
    } else if (!item.chave) {
      progresso.semIdTentado = true;
    }
    salvarProgresso();
  }

  function concluirPagina() {
    progresso.ultimaConcluida = estado.paginaAtual;
    progresso.paginaPendente = null;
    progresso.idsTentados = [];
    progresso.semIdTentado = false;
    salvarProgresso();
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
    paginaAtual: paginaInicial,
    paginasIniciadas: 0,
    paginasConcluidas: 0,
    cliques: 0,
    confirmados: 0,
    inconclusivos: 0,
    recusados: 0,
    falhasHttpConsecutivas: 0,
    ultimoHttp: null,
    ignorados: 0,
    falhas: 0,
    motivo: '',
    ultimaMensagem: retomarPagina
      ? 'Retomada: cupons já tentados não serão acionados novamente.'
      : 'Iniciando...'
  };

  const dormir = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const texto = el =>
    String(el?.innerText || el?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

  const inicioExecucao = performance.now();

  function tempoAtivo() {
    const agora = performance.now();

    const pausaAtual = estado.pausaInicio === null
      ? 0
      : agora - estado.pausaInicio;

    return agora - inicioExecucao - estado.pausaAcumuladaMs - pausaAtual;
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

  const estatisticas = document.createElement('span');
  estatisticas.style.cssText =
    'font-weight:bold;min-width:260px;white-space:normal;';

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

  painel.append(titulo, estatisticas, informacao, botaoPausa, botaoFechar);
  container.append(painel, frame);

  function atualizarPainel() {
    if (estado.encerrado) return;

    const prefixo = estado.finalizado
      ? 'Encerrado'
      : estado.pausado
        ? 'Pausado'
        : 'Executando';

    const segundos = Math.floor(tempoAtivo() / 1000);
    const duracao = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:` +
      String(segundos % 60).padStart(2, '0');
    estatisticas.textContent =
      `${estado.paginasConcluidas} pág. | ${estado.cliques} tent. | ` +
      `${estado.confirmados} confirm. | ${estado.inconclusivos} inconcl. | ` +
      `${estado.recusados} recus. | ${estado.ignorados} ignor. | ` +
      `${estado.falhas} falhas | HTTP ${estado.ultimoHttp ?? '—'} | ${duracao}`;
    informacao.textContent =
      `${prefixo} | Página ${estado.paginaAtual} | ${estado.ultimaMensagem}`;

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

  function limparProgresso() {
    if (!estado.finalizado && !estado.pausado) {
      console.warn('[ML Cupons] Pause ou finalize antes de limpar o progresso.');
      return;
    }
    try {
      localStorage.removeItem(storageKey);
      console.log('[ML Cupons] Progresso salvo removido. A execução atual não é reiniciada.');
    } catch (erro) {
      console.warn('[ML Cupons] Não foi possível limpar o progresso:', erro);
    }
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
      fecharCupons: fechar,
      limparProgressoCupons: limparProgresso
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
  window.limparProgressoCupons = limparProgresso;

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

  function botaoAtivavel(el) {
    return /^(?:aplicar|ativar|resgatar)(?:\s+(?:cupom|agora))?$/i.test(texto(el));
  }

  function botoesDeCupons() {
    const doc = documento();
    const cartoes = [...doc.querySelectorAll(seletorCartao)]
      .filter(el => el.getClientRects().length > 0);
    const controles = cartoes.length
      ? cartoes.flatMap(el => [...el.querySelectorAll('button, a, [role="button"]')])
      : [...doc.querySelectorAll('button, a, [role="button"]')];

    return [...new Set(controles)]
      .filter(botaoAtivavel)
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

  function urlPagina(pagina) {
    const url = new URL(CONFIG.url);
    if (pagina > 1) url.searchParams.set('page', String(pagina));
    return url.href;
  }

  function paginaDaUrl(doc) {
    const valor = new URL(doc.location.href).searchParams.get('page');
    return valor !== null && /^[1-9]\d*$/.test(valor)
      ? Number(valor) : null;
  }

  // Nunca considerar apenas uma alteração de texto uma navegação confirmada.
  function paginaConfirmada(doc, esperada) {
    const url = paginaDaUrl(doc);
    const atual = numeroPagina(doc);
    // Em páginas SPA, a URL pode estar defasada; o indicador ativo tem prioridade.
    if (atual !== null) return atual === esperada;
    if (url !== null && url !== esperada) return false;
    if (esperada === 1) return url === null || url === 1;
    if (url !== esperada) return false;

    // Na ausência de indicação da página selecionada, a paginação
    // precisa confirmar a página por meio de um link adjacente.
    const links = doc.querySelectorAll(
      'a[rel="next"], li.andes-pagination__button--next a, ' +
      '.andes-pagination__button--next a, a[rel="prev"]'
    );
    for (const link of links) {
      const destino = link.getAttribute('href');
      if (!destino) continue;
      try {
        const seguinte = Number(new URL(destino, doc.location.href).searchParams.get('page'));
        if (link.getAttribute('rel') === 'prev' && seguinte === esperada - 1) return true;
        if (link.getAttribute('rel') !== 'prev' && seguinte === esperada + 1) return true;
      } catch (_) {}
    }
    return false;
  }

  // Os avisos globais não comprovam sucesso, mas erros explícitos devem
  // interromper a automação, mesmo quando o status HTTP não está disponível.
  function textoAvisos(doc) {
    return [...doc.querySelectorAll(
      '[role="alert"], [role="status"], [aria-live="assertive"], ' +
      '.andes-message, .andes-snackbar, .andes-toast, ' +
      '[class*="snackbar"], [class*="toast"]'
    )].filter(el => el.getClientRects().length > 0)
      .map(texto).join(' ');
  }

  function erroInterrupcao(mensagem, status = null) {
    const erro = new Error(mensagem);
    erro.interromper = true;
    erro.respostaHttp = status;
    return erro;
  }

  function verificarBloqueios(doc) {
    const titulo = texto(doc.title ? { textContent: doc.title } : null);
    if (/captcha|acesso negado|verifica[cç][aã]o de seguran[cç]a/i.test(titulo)) {
      throw erroInterrupcao('Página exige verificação ou bloqueou o acesso.');
    }
    const aviso = textoAvisos(doc);
    if (/muitas solicita[cç][oõ]es|tente novamente mais tarde|too many requests/i.test(aviso)) {
      throw erroInterrupcao('Limitação temporária do serviço indicada pela interface.');
    }
    if (/tivemos um problema|ocorreu um problema|não foi possível ativar|nao foi possivel ativar/i.test(aviso)) {
      throw erroInterrupcao('Mercado Livre exibiu mensagem de erro na ativação: ' + aviso.slice(0, 160));
    }
  }

  // Lê SOMENTE os metadados de rede já coletados pelo navegador.
  // Não faz novos POSTs, não intercepta nem altera requisições.
  // responseStatus é suportado nos navegadores modernos, mas pode ser
  // omitido por configurações de privacidade; nesse caso usamos os avisos.
  function marcoAtivacao() {
    try {
      const desempenho = frame.contentWindow?.performance;
      return desempenho && typeof desempenho.now === 'function'
        ? desempenho.now() : null;
    } catch (_) {
      return null;
    }
  }

  function statusHttpAtivacao(marco) {
    if (marco === null) return null;
    try {
      const desempenho = frame.contentWindow?.performance;
      if (!desempenho?.getEntriesByType) return null;
      const recursos = desempenho.getEntriesByType('resource');
      for (let i = recursos.length - 1; i >= 0; i--) {
        const recurso = recursos[i];
        if (recurso.startTime + 1 < marco || !recurso.responseEnd) continue;
        let destino;
        try { destino = new URL(recurso.name); } catch (_) { continue; }
        if (destino.origin !== origem ||
            destino.pathname !== '/cupons/api/activate') continue;
        const codigo = Number(recurso.responseStatus);
        return Number.isInteger(codigo) && codigo >= 100 && codigo <= 599
          ? codigo : null;
      }
    } catch (erro) {
      console.warn('[ML Cupons] Status HTTP não acessível:', erro);
    }
    return null;
  }

  async function aguardarPagina(esperada, timeoutMs) {
    const inicio = tempoAtivo();
    let assinatura = '';
    let estavelDesde = null;

    while (!estado.encerrado && tempoAtivo() - inicio < timeoutMs) {
      if (!(await esperar(CONFIG.intervaloVerificacaoMs))) return false;
      let doc;
      try { doc = documento(); } catch (_) { continue; }
      if (doc.readyState === 'loading') continue;
      verificarBloqueios(doc);
      if (!paginaConfirmada(doc, esperada)) continue;

      const cartoes = [...doc.querySelectorAll(seletorCartao)]
        .filter(el => el.getClientRects().length > 0);
      const botoes = botoesDeCupons();
      const principal = doc.querySelector('main');
      const vazio = /nenhum cupom|sem cupons|n[aã]o encontramos cupons/i
        .test(texto(principal || doc.body));
      const carregando = doc.querySelector(
        '[aria-busy="true"], [role="progressbar"], .andes-spinner'
      );
      if (carregando || (!cartoes.length && !botoes.length && !vazio)) continue;

      const nova = JSON.stringify([
        paginaDaUrl(doc), numeroPagina(doc), cartoes.length, botoes.length
      ]);
      if (nova !== assinatura) {
        assinatura = nova;
        estavelDesde = tempoAtivo();
        continue;
      }
      if (estavelDesde !== null &&
          tempoAtivo() - estavelDesde >= CONFIG.esperaAposPaginaMs) {
        registrarTeclaNoFrame();
        return true;
      }
    }
    return false;
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

  async function navegarDireto(pagina, timeoutMs) {
    for (let tentativa = 1; tentativa <= CONFIG.maxTentativasNavegacao; tentativa++) {
      if (!(await aguardarExecucao())) return false;
      frame.src = urlPagina(pagina);
      mostrar(`Carregando diretamente a página ${pagina} (tentativa ${tentativa})...`);
      if (await aguardarPagina(pagina, timeoutMs)) {
        estado.paginaAtual = pagina;
        return true;
      }
    }
    return false;
  }

  async function avancarPagina() {
    if (!(await aguardarExecucao())) return false;
    const esperada = estado.paginaAtual + 1;
    let proximo = encontrarProxima();
    if (!proximo) return false;

    proximo.scrollIntoView({ block: 'center', behavior: 'auto' });
    if (!(await esperar(150))) return false;
    proximo = encontrarProxima();
    if (!proximo) {
      throw new Error('Botão Próxima indisponível antes da navegação.');
    }

    proximo.click();
    mostrar(`Verificando mudança para a página ${esperada}...`);
    if (await aguardarPagina(esperada, CONFIG.timeoutMudancaPaginaMs)) {
      estado.paginaAtual = esperada;
      return true;
    }
    if (estado.encerrado) return false;

    // Recuperação sem clicar novamente em Próxima nem em cupons.
    console.warn('[ML Cupons] Navegação não confirmada; tentando URL direta.');
    if (await navegarDireto(esperada, CONFIG.timeoutMudancaPaginaMs)) return true;
    throw new Error(
      `Não foi possível confirmar a página ${esperada}. ` +
      'Nenhum cupom desta página foi processado.'
    );
  }

  // Só identificadores explícitos; nunca inferir cupom pelo índice visual.
  function chaveCupom(botao) {
    const cartao = botao.closest(seletorCartao);
    for (const el of [botao, cartao]) {
      if (!el) continue;
      for (const atributo of [
        'data-coupon-id', 'data-couponid', 'data-coupon_id',
        'data-voucher-id', 'data-promotion-id'
      ]) {
        const valor = el.getAttribute(atributo);
        if (valor) return `${atributo}:${valor}`;
      }
    }
    return null;
  }

  function resolverBotao(item) {
    if (item.elemento.isConnected && botaoAtivavel(item.elemento) &&
        (!item.chave || chaveCupom(item.elemento) === item.chave)) {
      return item.elemento;
    }
    if (!item.chave) return null;
    const candidatos = botoesDeCupons()
      .filter(botao => chaveCupom(botao) === item.chave);
    return candidatos.length === 1 ? candidatos[0] : null;
  }

  // Evidências de sucesso devem pertencer ao cupom acionado.
  // Textos como "Conferir" são aceitos apenas quando surgirem
  // APÓS um clique, no próprio controle ou no cartão correspondente.
  function rotuloSucesso(rotulo) {
    return /^(?:ativad[oa]|resgatad[oa]|cupom\s+aplicad[oa]|aplicad[oa]|cupom\s+resgatad[oa]|conferir(?:\s+(?:cupom|oferta))?|ver\s+(?:(?:meu|o)\s+)?cupom)(?:\s*[!.])?$/i
      .test(String(rotulo || '').trim().replace(/\s+/g, ' '));
  }

  function rotulosElemento(el) {
    return [
      texto(el),
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('title')
    ].filter(Boolean).map(valor => String(valor).trim());
  }

  function elementosMesmoCupom(item) {
    const candidatos = [];
    if (item.elemento.isConnected &&
        (!item.chave || chaveCupom(item.elemento) === item.chave)) {
      candidatos.push(item.elemento);
    }

    // Se o botão for substituído pelo React, procurar somente
    // o mesmo identificador ou o cartão original ainda conectado.
    if (item.chave) {
      for (const el of documento().querySelectorAll('button, a, [role="button"]')) {
        if (el.isConnected && chaveCupom(el) === item.chave) {
          candidatos.push(el);
        }
      }
    } else if (item.cartao?.isConnected) {
      for (const el of item.cartao.querySelectorAll('button, a, [role="button"]')) {
        if (el.isConnected) candidatos.push(el);
      }
    }

    return [...new Set(candidatos)];
  }

  function rotulosDeSucesso(item) {
    return new Set(
      elementosMesmoCupom(item)
        .flatMap(rotulosElemento)
        .filter(rotuloSucesso)
    );
  }

  function cupomConfirmado(item) {
    // Só considerar um sinal de sucesso que NÃO existia antes do clique.
    for (const rotulo of rotulosDeSucesso(item)) {
      if (!item.rotulosAntes?.has(rotulo)) return true;
    }
    return false;
  }

  async function aguardarConfirmacao(item, marco) {
    const inicio = tempoAtivo();
    while (!estado.encerrado &&
           tempoAtivo() - inicio < CONFIG.esperaConfirmacaoMs) {
      if (!(await esperar(CONFIG.intervaloVerificacaoMs))) {
        return { tipo: 'interrompido', http: null };
      }

      const status = statusHttpAtivacao(marco);
      if (status !== null) {
        estado.ultimoHttp = status;
        if ([401, 403, 429].includes(status)) {
          throw erroInterrupcao(
            `Mercado Livre recusou a ativação: HTTP ${status}. ` +
            'Execução interrompida; não serão feitas novas tentativas.',
            status
          );
        }
        if (status >= 400) {
          return { tipo: 'recusado', http: status };
        }
      }

      // Erros na UI impedem seguir para outro cupom, mesmo sem status HTTP.
      const doc = documento();
      verificarBloqueios(doc);
      if (cupomConfirmado(item)) {
        return { tipo: 'confirmado', http: status };
      }
    }
    return { tipo: 'inconclusivo', http: statusHttpAtivacao(marco) };
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
      cartao: elemento.closest(seletorCartao),
      chave: chaveCupom(elemento)
    }));
    const contagem = new Map();
    for (const item of itens) {
      if (item.chave) {
        contagem.set(item.chave, (contagem.get(item.chave) || 0) + 1);
      }
    }
    for (const item of itens) {
      if (item.chave && contagem.get(item.chave) !== 1) {
        item.ambiguo = true;
        item.chave = null;
      }
    }

    // Se a página estava incompleta em outra execução, suprimir
    // identificadores já acionados e controles sem identidade confiável.
    const jaTentados = new Set(progresso.idsTentados);
    const preservarSemId = retomarPagina &&
      estado.paginaAtual === paginaInicial &&
      progresso.semIdTentado;

    mostrar(`${itens.length} cupom(ns) localizados nesta página.`);
    let cliquesPagina = 0;

    for (let i = 0; i < itens.length; i++) {
      if (!(await aguardarExecucao())) return false;
      const item = itens[i];
      if (item.ambiguo) {
        estado.ignorados++;
        mostrar(`Item ${i + 1}/${itens.length}: identificador duplicado; ignorado.`);
        continue;
      }

      if ((item.chave && jaTentados.has(item.chave)) ||
          (!item.chave && preservarSemId)) {
        estado.ignorados++;
        continue;
      }

      let botao = resolverBotao(item);
      if (!botao || !visivelEHabilitado(botao)) {
        estado.ignorados++;
        mostrar(`Item ${i + 1}/${itens.length} indisponível ou sem identidade estável.`);
        continue;
      }

      botao.scrollIntoView({ block: 'center', behavior: 'auto' });
      if (!(await esperar(120))) return false;
      botao = resolverBotao(item);
      if (!botao || !visivelEHabilitado(botao)) {
        estado.ignorados++;
        continue;
      }

      // Uma mensagem de erro antiga também bloqueia novas ativações.
      verificarBloqueios(documento());

      // Registra sinais de sucesso que já existiam, evitando falsos positivos.
      item.rotulosAntes = rotulosDeSucesso(item);

      // Registrar antes de clicar para proteger a retomada após falhas.
      registrarTentativa(item);
      try {
        const marco = marcoAtivacao();
        botao.click();
        estado.cliques++;
        cliquesPagina++;

        const resultado = await aguardarConfirmacao(item, marco);
        if (resultado.tipo === 'interrompido') return false;

        if (resultado.tipo === 'confirmado') {
          estado.confirmados++;
          estado.falhasHttpConsecutivas = 0;
        } else if (resultado.tipo === 'recusado') {
          estado.recusados++;
          estado.falhas++;
          estado.falhasHttpConsecutivas++;
        } else {
          // A ausência de texto de sucesso não é uma falha.
          estado.inconclusivos++;
          estado.falhasHttpConsecutivas = 0;
        }

        mostrar(
          `Item ${i + 1}/${itens.length}: ` +
          (resultado.tipo === 'confirmado' ? 'ativação confirmada.' :
           resultado.tipo === 'recusado' ? `recusado (HTTP ${resultado.http}).` :
            'tentativa realizada; ativação não verificável pela interface.')
        );

        if (estado.falhasHttpConsecutivas >= CONFIG.maxFalhasHttpConsecutivas) {
          throw erroInterrupcao(
            `${estado.falhasHttpConsecutivas} recusas HTTP consecutivas. ` +
            'Execução interrompida para não insistir nas ativações.'
          );
        }
      } catch (erro) {
        // Um limite de falhas HTTP já contabilizadas não é uma nova falha.
        const limiteJaContabilizado =
          erro.interromper && erro.respostaHttp === null &&
          estado.falhasHttpConsecutivas >= CONFIG.maxFalhasHttpConsecutivas;
        if (!erro.contabilizado && !limiteJaContabilizado) {
          if (erro.respostaHttp >= 400) estado.recusados++;
          estado.falhas++;
        }
        erro.contabilizado = true;
        console.warn(`[ML Cupons] Interrupção/falha no item ${i + 1}:`, erro);
        if (erro.interromper) throw erro;
        const inesperado = erroInterrupcao(
          'Falha inesperada ao processar cupom: ' + erro.message
        );
        inesperado.contabilizado = true;
        throw inesperado;
      }
      if (!(await esperar(CONFIG.intervaloCliquesMs))) return false;
    }

    if (!(await esperar(CONFIG.esperaAposCuponsMs))) return false;
    mostrar(
      `Página concluída: ${cliquesPagina} tentativa(s), ` +
      `${estado.confirmados} confirmação(ões) acumulada(s).`
    );
    return true;
  }

  async function carregarPrimeiraPagina() {
    mostrar(`Abrindo diretamente a página ${paginaInicial}...`);
    document.body.appendChild(container);
    if (!(await navegarDireto(paginaInicial, CONFIG.timeoutPrimeiraPaginaMs))) {
      if (estado.encerrado) return false;
      throw new Error(
        `Não foi possível verificar o carregamento da página ${paginaInicial}. ` +
        'Verifique o login, o iframe e os indicadores de paginação.'
      );
    }
    return true;
  }

  try {
    if (!(await carregarPrimeiraPagina())) return;

    // A página solicitada foi acessada diretamente via &page=X.
    // Não percorremos páginas anteriores.

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
      iniciarPagina();

      const concluida = await aplicarNaPagina();

      if (!concluida || estado.encerrado) return;

      estado.paginasConcluidas++;
      concluirPagina();

      if (!(await aguardarExecucao())) return;

      if (!encontrarProxima()) {
        estado.motivo =
          'Sem botão Próxima habilitado; fim da paginação detectada.';
        progresso.terminou = true;
        salvarProgresso();
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
    if (!erro.contabilizado) estado.falhas++;
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
      ativacoesConfirmadas: estado.confirmados,
      ativacoesInconclusivas: estado.inconclusivos,
      recusasHttp: estado.recusados,
      ultimoHttp: estado.ultimoHttp,
      ignorados: estado.ignorados,
      ultimaPaginaConcluida: progresso.ultimaConcluida,
      paginaPendente: progresso.paginaPendente,
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