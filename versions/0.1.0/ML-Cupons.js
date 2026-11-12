// Mercado Livre - Ativar cupons de TODAS as páginas (v2.0)
//
// COMO USAR
// 1. Faça login no Mercado Livre.
// 2. Abra https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all
// 3. Pressione F12 > Console, cole este arquivo inteiro e pressione Enter.
// 4. Para interromper: clique em "Parar", pressione ESC ou execute pararCupons().
//    Para fechar o painel: clique em "Fechar" ou execute fecharCupons().
//
// O script registra TENTATIVAS de clique; não tem acesso à confirmação individual
// de cada ativação. Não precisa que cupons ativados desapareçam da listagem.

(async () => {
  'use strict';

  const CONFIG = {
    url: 'https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all',
    maxPaginas: 200,              // trava de segurança; não indica o total real de páginas
    maxCuponsPorPagina: 300,     // trava contra uma eventual alteração inesperada da página
    intervaloCliquesMs: 650,
    esperaAposPaginaMs: 1400,
    esperaAposCuponsMs: 1100,
    timeoutPrimeiraPaginaMs: 25000,
    timeoutMudancaPaginaMs: 16000
  };

  const origem = new URL(CONFIG.url).origin;
  if (location.origin !== origem) {
    console.error(`❌ Abra ${CONFIG.url} antes de executar o script (é necessário usar a mesma origem).`);
    return;
  }

  // Não deixar a automação antiga executando simultaneamente.
  try { window.fecharCupons?.(); } catch (_) { /* versão anterior */ }
  document.getElementById('cupom-iframe-container')?.remove();

  const estado = { parado: false, paginas: 0, cliques: 0, falhas: 0, motivo: '' };
  const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
  const texto = el => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();

  const container = document.createElement('div');
  container.id = 'cupom-iframe-container';
  container.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;';

  const frame = document.createElement('iframe');
  frame.id = 'cupom-iframe';
  frame.title = 'Cupons do Mercado Livre';
  frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';

  const painel = document.createElement('div');
  painel.style.cssText = 'position:absolute;right:12px;top:8px;z-index:2;display:flex;gap:8px;align-items:center;padding:7px 9px;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 2px 10px #0003;font:13px Arial,sans-serif;';

  const informacao = document.createElement('span');
  informacao.style.cssText = 'color:#333;max-width:390px;';
  informacao.textContent = 'Iniciando...';

  const botaoParar = document.createElement('button');
  botaoParar.textContent = '⏹ Parar';
  const botaoFechar = document.createElement('button');
  botaoFechar.textContent = '✕ Fechar';
  for (const botao of [botaoParar, botaoFechar]) {
    botao.style.cssText = 'padding:6px 9px;border:1px solid #999;border-radius:5px;background:#f6f6f6;cursor:pointer;font:13px Arial,sans-serif;';
  }
  painel.append(informacao, botaoParar, botaoFechar);
  container.append(frame, painel);

  function mostrar(mensagem) {
    informacao.textContent = mensagem;
    console.log(`🎟️ ${mensagem}`);
  }

  function parar() {
    if (estado.parado) return;
    estado.parado = true;
    estado.motivo = 'Interrompido manualmente';
    mostrar('⏹ Interrompendo...');
  }

  function fechar() {
    parar();
    container.remove();
    window.removeEventListener('keydown', teclaParar);
    // Não excluir funções que tenham sido substituídas por uma execução nova.
    if (window.pararCupons === parar) delete window.pararCupons;
    if (window.fecharCupons === fechar) delete window.fecharCupons;
  }

  function teclaParar(evento) {
    if (evento.key === 'Escape') parar();
  }

  window.pararCupons = parar;
  window.fecharCupons = fechar;
  window.addEventListener('keydown', teclaParar);
  // O foco normalmente fica dentro do iframe; ouvir ESC também ali.
  frame.addEventListener('load', () => {
    try { frame.contentDocument?.addEventListener('keydown', teclaParar); } catch (_) { /* redirecionamento */ }
  });
  botaoParar.addEventListener('click', parar);
  botaoFechar.addEventListener('click', fechar);

  function documento() {
    try {
      const doc = frame.contentDocument;
      if (!doc?.body) throw new Error('Documento ainda não carregado.');
      const endereco = new URL(doc.location.href);
      if (endereco.origin !== origem || !endereco.pathname.startsWith('/cupons')) {
        throw new Error(`O iframe está em ${endereco.href} (talvez seja necessário fazer login).`);
      }
      return doc;
    } catch (erro) {
      throw new Error(`Não foi possível acessar a página de cupons no iframe. Verifique login, bloqueio de iframe ou mudança de domínio. Detalhe: ${erro.message}`);
    }
  }

  function visivelEHabilitado(el) {
    if (!el?.isConnected || el.matches(':disabled')) return false;
    if (el.closest('[disabled], [aria-disabled="true"], .andes-pagination__button--disabled, .andes-button--disabled')) return false;
    const estilo = el.ownerDocument.defaultView.getComputedStyle(el);
    return estilo.display !== 'none' && estilo.visibility !== 'hidden' && el.getClientRects().length > 0;
  }

  function botoesDeCupons() {
    const doc = documento();
    return [...doc.querySelectorAll('button, a, [role="button"]')]
      .filter(el => /^(?:aplicar|ativar|resgatar)(?:\s+(?:cupom|agora))?$/i.test(texto(el)))
      .filter(el => !el.querySelector('button, a, [role="button"]')) // sem duplicar controles aninhados
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
      if (n) return n[0];
    }
    return '';
  }

  function fotografiaPagina() {
    const doc = documento();
    const cartoes = [...doc.querySelectorAll(
      '[data-testid*="coupon-card"], [class*="coupon-card"], [class*="coupon-item"], [class*="coupon-list__item"]'
    )].filter(el => el.getClientRects().length > 0);

    // Ajuda a detectar troca de conteúdo em sites SPA quando a URL não muda.
    // A fotografia é obtida DEPOIS dos cliques, para não confundir ativação com paginação.
    const conteudo = cartoes.length
      ? cartoes.slice(0, 35).map(el => texto(el).slice(0, 400)).join('|')
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
      (Boolean(antes.numero && depois.numero) && antes.numero !== depois.numero) ||
      (Boolean(antes.conteudo && depois.conteudo) && antes.conteudo !== depois.conteudo)
    );
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
      const el = doc.querySelector(seletor);
      if (el && visivelEHabilitado(el)) return el;
    }

    // Fallback restrito aos controles de paginação para não clicar em carrosséis.
    const areas = [...doc.querySelectorAll('nav, .andes-pagination, [class*="pagination"]')];
    const vistos = new Set();
    for (const area of areas) {
      for (const el of area.querySelectorAll('a, button, [role="button"]')) {
        if (vistos.has(el)) continue;
        vistos.add(el);
        const rotulo = [texto(el), el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' ');
        if (/\b(pr[oó]xim[ao]|next|avan[cç]ar|seguinte)\b/i.test(rotulo) && visivelEHabilitado(el)) return el;
      }
    }
    return null;
  }

  async function aguardarOutraPagina(anterior) {
    const inicio = Date.now();
    while (!estado.parado && Date.now() - inicio < CONFIG.timeoutMudancaPaginaMs) {
      await esperar(300);
      let atual;
      try { atual = fotografiaPagina(); } catch (_) { continue; }
      if (!paginaDiferente(anterior, atual)) continue;
      await esperar(CONFIG.esperaAposPaginaMs);
      if (estado.parado) return false;
      try {
        const confirmacao = fotografiaPagina();
        if (paginaDiferente(anterior, confirmacao)) return true;
      } catch (_) { /* talvez ainda esteja navegando */ }
    }
    return false;
  }

  async function aplicarNaPagina() {
    // Fotografia única dos botões da página: não esperar que desapareçam
    // e não voltar a clicar no mesmo cupom por continuar exibindo "Aplicar".
    const botoes = botoesDeCupons();
    mostrar(`Página ${estado.paginas}: ${botoes.length} cupom(ns) disponível(is) para clicar.`);
    if (botoes.length > CONFIG.maxCuponsPorPagina) {
      throw new Error(`A página retornou ${botoes.length} botões; limite seguro de ${CONFIG.maxCuponsPorPagina} atingido.`);
    }

    let cliquesPagina = 0;
    for (let i = 0; i < botoes.length && !estado.parado; i++) {
      // React pode recriar os botões após cada clique. Como os cartões agora
      // permanecem na listagem, usamos a mesma posição se a referência sumiu.
      const botao = botoes[i].isConnected ? botoes[i] : botoesDeCupons()[i];
      if (!botao || !visivelEHabilitado(botao)) continue;
      try {
        botao.scrollIntoView({ block: 'center', behavior: 'auto' });
        await esperar(120);
        if (estado.parado || !visivelEHabilitado(botao)) break;
        botao.click();
        cliquesPagina++;
        estado.cliques++;
        console.log(`🖱️ Página ${estado.paginas}: clique ${cliquesPagina}/${botoes.length} (total ${estado.cliques}).`);
      } catch (erro) {
        estado.falhas++;
        console.warn(`⚠️ Falha no cupom ${i + 1} da página ${estado.paginas}:`, erro);
      }
      await esperar(CONFIG.intervaloCliquesMs);
    }
    if (!estado.parado) await esperar(CONFIG.esperaAposCuponsMs);
    return cliquesPagina;
  }

  try {
    const primeiraCarga = new Promise(resolve => {
      frame.addEventListener('load', () => resolve(true), { once: true });
      setTimeout(() => resolve(false), CONFIG.timeoutPrimeiraPaginaMs);
    });

    document.body.appendChild(container);
    frame.src = CONFIG.url;
    mostrar('Carregando página 1 de todos os cupons...');
    if (!(await primeiraCarga)) throw new Error('Tempo limite de carregamento da primeira página.');
    await esperar(CONFIG.esperaAposPaginaMs);
    documento();

    const visitadas = new Set();
    while (!estado.parado && estado.paginas < CONFIG.maxPaginas) {
      const fotoInicial = fotografiaPagina();
      // Usa URL e número quando disponíveis; conteúdo como último recurso.
      const identificador = fotoInicial.numero
        ? `p:${fotoInicial.numero}`
        : (fotoInicial.url !== CONFIG.url ? `url:${fotoInicial.url}` : `conteudo:${fotoInicial.conteudo}`);
      if (visitadas.has(identificador)) {
        estado.motivo = 'Página repetida detectada (proteção contra loop)';
        console.warn(`⚠️ ${estado.motivo}`);
        break;
      }
      visitadas.add(identificador);
      estado.paginas++;

      await aplicarNaPagina();
      if (estado.parado) break;
      if (estado.paginas >= CONFIG.maxPaginas) {
        estado.motivo = `Limite de segurança (${CONFIG.maxPaginas} páginas)`;
        break;
      }

      const proximo = encontrarProxima();
      if (!proximo) {
        estado.motivo = 'Última página alcançada (sem botão Próxima habilitado)';
        break;
      }

      const anterior = fotografiaPagina();
      mostrar(`Página ${estado.paginas} concluída. Indo para a próxima...`);
      proximo.scrollIntoView({ block: 'center', behavior: 'auto' });
      await esperar(200);
      if (estado.parado) break;
      proximo.click();

      const mudou = await aguardarOutraPagina(anterior);
      if (!mudou) {
        estado.motivo = 'Não foi possível confirmar a mudança de página (evitando loop)';
        console.warn(`⚠️ ${estado.motivo}`);
        break;
      }
    }

    if (!estado.motivo) estado.motivo = 'Execução encerrada';
  } catch (erro) {
    estado.falhas++;
    estado.motivo = `Erro: ${erro.message}`;
    console.error('❌ Erro durante o processamento:', erro);
  } finally {
    console.log('📊 RESUMO:', {
      paginasPercorridas: estado.paginas,
      tentativasDeClique: estado.cliques,
      ativacoesConfirmadas: 'não verificadas individualmente',
      falhas: estado.falhas,
      motivo: estado.motivo
    });
    mostrar(`Fim: ${estado.paginas} página(s), ${estado.cliques} clique(s). ${estado.motivo}`);
    console.log('Para remover o iframe, clique em "Fechar" ou execute fecharCupons().');
  }
})();
