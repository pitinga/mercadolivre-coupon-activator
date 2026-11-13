'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'mercadolivre-coupon-activator.js'), 'utf8'
);

async function executar({ pagina = '3', cartoes = [], salvo = null, paginaRenderizada = null, httpStatus = null, mensagemErro = null, cartoesSemSeletor = false, sempreCarregando = false }) {
  const storage = new Map();
  const storageKey = 'ml-coupon-activator:progress:0.3.0';
  if (salvo) storage.set(storageKey, JSON.stringify(salvo));
  let clock = 0;
  let documentoAtual;
  const fontes = [];
  const cliques = [];
  const recursos = [];
  let avisoAtivacao = '';
  let resumo = null;
  const avisos = [];

  function elemento(textContent = '', atributos = {}) {
    const obj = {
      textContent, innerText: textContent, isConnected: true,
      style: {}, ownerDocument: null,
      getAttribute(name) { return atributos[name] ?? null; },
      getClientRects() { return [{}]; },
      matches() { return false; },
      closest() { return null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      addEventListener() {}, removeEventListener() {},
      scrollIntoView() {}, append() {}, appendChild() {}, remove() {},
      click() {}
    };
    return obj;
  }

  function paginaFake(endereco) {
    const url = new URL(endereco);
    const numero = paginaRenderizada ?? Number(url.searchParams.get('page') || '1');
    const atual = elemento(String(numero));
    const cards = cartoes.map((item, pos) => {
      const card = elemento('Oferta de cupom ' + pos, { 'data-coupon-id': item.id });
      const button = elemento(item.rotuloInicial || 'Ativar');
      button.closest = seletor =>
        seletor.includes('[disabled]') ? null : card;
      card.closest = seletor =>
        seletor.includes('[disabled]') ? null : card;
      card.querySelectorAll = seletor =>
        seletor.includes('[role="button"]') ? [button] : [];
      button.click = () => {
        cliques.push(item.id || pos);
        if (httpStatus !== null) {
          recursos.push({
            name: 'https://www.mercadolivre.com.br/cupons/api/activate?coupon_activate_code=TESTE',
            startTime: clock,
            responseEnd: clock + 1,
            responseStatus: httpStatus
          });
        }
        if (mensagemErro) avisoAtivacao = mensagemErro;
        if (item.confirmar) {
          button.textContent = item.rotuloSucesso || 'Ativado';
          button.innerText = item.rotuloSucesso || 'Ativado';
        }
      };
      return { card, button };
    });
    const listaCards = cards.map(x => x.card);
    const listaBotoes = cards.map(x => x.button);
    const principal = elemento(cartoes.length ? 'Cupons disponíveis' : 'Nenhum cupom');
    const doc = {
      location: { href: url.href },
      title: 'Cupons',
      body: elemento('Página de cupons'),
      readyState: 'complete',
      defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
      addEventListener() {}, removeEventListener() {},
      querySelector(seletor) {
        if (seletor === '.andes-pagination [aria-current="page"]') return atual;
        if (seletor === 'main') return principal;
        if (seletor.includes('[aria-busy="true"]') && sempreCarregando) return elemento('Carregando...');
        return null;
      },
      querySelectorAll(seletor) {
        if (seletor.includes('[role="alert"]') && avisoAtivacao) {
          const aviso = elemento(avisoAtivacao);
          aviso.ownerDocument = doc;
          return [aviso];
        }
        if (seletor.includes('[data-testid*="coupon-card"]')) return cartoesSemSeletor ? [] : listaCards;
        if (seletor === 'button, a, [role="button"]') return listaBotoes;
        return [];
      }
    };
    for (const { card, button } of cards) {
      card.ownerDocument = doc;
      button.ownerDocument = doc;
    }
    atual.ownerDocument = doc;
    principal.ownerDocument = doc;
    return doc;
  }

  const window = { addEventListener() {}, removeEventListener() {} };
  const fakeFrame = elemento();
  fakeFrame.contentWindow = {
    performance: {
      now() { return clock; },
      getEntriesByType(tipo) {
        return tipo === 'resource' ? recursos : [];
      }
    }
  };
  Object.defineProperty(fakeFrame, 'src', {
    set(u) {
      fontes.push(u);
      documentoAtual = paginaFake(u);
    },
    get() { return fontes.at(-1) || ''; }
  });
  Object.defineProperty(fakeFrame, 'contentDocument', {
    get() { return documentoAtual; }
  });
  const document = {
    body: elemento(),
    getElementById() { return null; },
    createElement(tag) {
      return tag === 'iframe' ? fakeFrame : elemento();
    }
  };

  const contexto = {
    window, document, location: { origin: 'https://www.mercadolivre.com.br' },
    localStorage: {
      getItem(k) { return storage.get(k) ?? null; },
      setItem(k,v) { storage.set(k,v); },
      removeItem(k) { storage.delete(k); }
    },
    console: {
      log(...args) { if (args[0] === '[ML Cupons] RESUMO:') resumo = args[1]; },
      warn(...args) { avisos.push(args); }, error() {}
    },
    prompt(mensagem, padrao) { return pagina === undefined ? padrao : pagina; },
    setTimeout(callback, ms) {
      clock += ms;
      queueMicrotask(callback);
      return 1;
    },
    performance: { now() { return clock; } },
    URL, Date
  };

  await vm.runInNewContext(script, contexto, { timeout: 2000 });
  return {
    resumo, cliques, fontes, avisos,
    progresso: JSON.parse(storage.get(storageKey) || 'null')
  };
}

test('cupom com alteração explícita para Ativado é confirmado', async () => {
  const run = await executar({
    cartoes: [{id:'A', confirmar:true}]
  });
  assert.equal(run.cliques.length, 1);
  assert.equal(run.resumo.tentativasDeClique, 1);
  assert.equal(run.resumo.ativacoesConfirmadas, 1);
  assert.equal(run.resumo.ativacoesInconclusivas, 0);
  assert.equal(run.progresso.ultimaConcluida, 3);
  assert.equal(run.progresso.terminou, true);
});

test('ausência de confirmação explícita é registrada como inconclusiva', async () => {
  const run = await executar({
    cartoes: [{id:'B', confirmar:false}]
  });
  assert.equal(run.cliques.length, 1);
  assert.equal(run.resumo.ativacoesConfirmadas, 0);
  assert.equal(run.resumo.ativacoesInconclusivas, 1);
});

test('retomada ignora cupom de identidade já tentada', async () => {
  const run = await executar({
    pagina: undefined,
    cartoes: [{id:'C', confirmar:true}],
    salvo: {
      versao: '0.3.0', ultimaConcluida: 2,
      paginaPendente: 3, idsTentados: ['data-coupon-id:C'],
      semIdTentado: false, terminou: false
    }
  });
  assert.equal(run.fontes.length, 1);
  assert.equal(new URL(run.fontes[0]).searchParams.get('page'), '3');
  assert.equal(run.cliques.length, 0);
  assert.equal(run.resumo.ignorados, 1);
  assert.equal(run.progresso.ultimaConcluida, 3);
});

test('identificadores duplicados não recebem clique', async () => {
  const run = await executar({
    cartoes: [
      {id:'D', confirmar:true},
      {id:'D', confirmar:true}
    ]
  });
  assert.equal(run.cliques.length, 0);
  assert.equal(run.resumo.ignorados, 2);
});

test('divergência da paginação impede qualquer clique', async () => {
  const run = await executar({
    pagina: '50',
    paginaRenderizada: 1,
    cartoes: [{id:'E', confirmar:true}]
  });
  assert.equal(run.cliques.length, 0);
  assert.equal(run.resumo.tentativasDeClique, 0);
  assert.equal(run.resumo.falhas, 1);
});

test('HTTP 403 interrompe após um clique sem avançar nem repetir tentativas', async () => {
  const run = await executar({
    pagina: '53',
    httpStatus: 403,
    cartoes: [
      {id:'403-A', confirmar:false},
      {id:'403-B', confirmar:false}
    ]
  });
  assert.equal(run.cliques.length, 1);
  assert.equal(run.resumo.tentativasDeClique, 1);
  assert.equal(run.resumo.recusasHttp, 1);
  assert.equal(run.resumo.ultimoHttp, 403);
  assert.equal(run.resumo.falhas, 1);
  assert.match(run.resumo.motivo, /HTTP 403/);
  assert.equal(run.progresso.paginaPendente, 53);
  assert.equal(run.progresso.ultimaConcluida, 52);
  assert.deepEqual(run.progresso.idsTentados, ['data-coupon-id:403-A']);
});

test('HTTP 429 interrompe também sem repetição automática', async () => {
  const run = await executar({
    httpStatus: 429,
    cartoes: [{id:'429-A', confirmar:false}, {id:'429-B', confirmar:false}]
  });
  assert.equal(run.cliques.length, 1);
  assert.equal(run.resumo.recusasHttp, 1);
  assert.match(run.resumo.motivo, /HTTP 429/);
});

test('duas recusas HTTP 500 consecutivas interrompem antes do terceiro cupom', async () => {
  const run = await executar({
    httpStatus: 500,
    cartoes: [
      {id:'500-A', confirmar:false},
      {id:'500-B', confirmar:false},
      {id:'500-C', confirmar:false}
    ]
  });
  assert.equal(run.cliques.length, 2);
  assert.equal(run.resumo.recusasHttp, 2);
  assert.equal(run.resumo.falhas, 2);
  assert.equal(run.progresso.paginaPendente, 3);
});

test('toast de erro Tivemos um problema interrompe quando status HTTP não está visível', async () => {
  const run = await executar({
    mensagemErro: 'Tivemos um problema',
    cartoes: [
      {id:'AVISO-A', confirmar:false},
      {id:'AVISO-B', confirmar:false}
    ]
  });
  assert.equal(run.cliques.length, 1);
  assert.match(run.resumo.motivo, /Tivemos um problema/);
  assert.equal(run.resumo.falhas, 1);
});

test('múltiplas tentativas inconclusivas não interrompem a execução', async () => {
  const run = await executar({
    cartoes: [
      {id:'INC-A', confirmar:false},
      {id:'INC-B', confirmar:false},
      {id:'INC-C', confirmar:false},
      {id:'INC-D', confirmar:false}
    ]
  });
  assert.equal(run.cliques.length, 4);
  assert.equal(run.resumo.ativacoesInconclusivas, 4);
  assert.equal(run.resumo.falhas, 0);
  assert.equal(run.resumo.paginasConcluidas, 1);
  assert.equal(run.progresso.ultimaConcluida, 3);
  assert.equal(run.progresso.paginaPendente, null);
});

test('Conferir surgindo após o clique confirma somente o cupom associado', async () => {
  const run = await executar({
    cartoes: [{id:'CONF-A', confirmar:true, rotuloSucesso:'Conferir'}]
  });
  assert.equal(run.resumo.tentativasDeClique, 1);
  assert.equal(run.resumo.ativacoesConfirmadas, 1);
  assert.equal(run.resumo.ativacoesInconclusivas, 0);
});

test('Ver cupom surgindo após o clique confirma somente o cupom associado', async () => {
  const run = await executar({
    cartoes: [{id:'CONF-B', confirmar:true, rotuloSucesso:'Ver cupom'}]
  });
  assert.equal(run.resumo.ativacoesConfirmadas, 1);
});

test('estado final sem rótulo de sucesso continua inconclusivo sem falha', async () => {
  const run = await executar({
    cartoes: [{id:'SEM-SINAL', confirmar:false, rotuloInicial:'Ativar'}]
  });
  assert.equal(run.resumo.ativacoesConfirmadas, 0);
  assert.equal(run.resumo.ativacoesInconclusivas, 1);
  assert.equal(run.resumo.falhas, 0);
});

test('página 83 com somente Conferir e sem seletores de cartão conhecidos é válida', async () => {
  const run = await executar({
    pagina: '83',
    cartoesSemSeletor: true,
    cartoes: [
      {id:'ATIVADO-A', rotuloInicial:'Conferir'},
      {id:'ATIVADO-B', rotuloInicial:'Conferir'},
      {id:'ATIVADO-C', rotuloInicial:'Conferir'}
    ]
  });
  assert.equal(run.fontes.length, 1);
  assert.equal(new URL(run.fontes[0]).searchParams.get('page'), '83');
  assert.equal(run.resumo.paginasConcluidas, 1);
  assert.equal(run.resumo.ultimaPagina, 83);
  assert.equal(run.resumo.tentativasDeClique, 0);
  assert.equal(run.resumo.falhas, 0);
  assert.equal(run.progresso.ultimaConcluida, 83);
});

test('pagina 83 não é aceita quando indicador selecionado ainda mostra 82', async () => {
  const run = await executar({
    pagina: '83',
    paginaRenderizada: 82,
    cartoesSemSeletor: true,
    cartoes: [{id:'ATIVADO', rotuloInicial:'Conferir'}]
  });
  assert.equal(run.resumo.paginasConcluidas, 0);
  assert.equal(run.resumo.falhas, 1);
  assert.equal(run.resumo.tentativasDeClique, 0);
  assert.ok(run.avisos.some(args =>
    String(args[0]).includes('Diagnóstico: página não confirmada')
  ));
});

test('página com spinner ativo não é considerada pronta', async () => {
  const run = await executar({
    pagina: '83',
    cartoesSemSeletor: true,
    sempreCarregando: true,
    cartoes: [{id:'ATIVADO', rotuloInicial:'Conferir'}]
  });
  assert.equal(run.resumo.falhas, 1);
  assert.equal(run.resumo.paginasConcluidas, 0);
  assert.equal(run.resumo.tentativasDeClique, 0);
  assert.ok(run.avisos.some(args => args[1]?.carregando === true));
});
