'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync(
  path.join(__dirname, '..', 'mercadolivre-coupon-activator.js'),
  'utf8'
);

function navegadorFalso(entrada, progresso = null, { url =
  'https://www.mercadolivre.com.br/cupons/filter?all=true&source_page=int_view_all',
  retomarProgresso = false, paginaFinal = null, paginaInicial = null } = {}) {
  const registro = new Map();
  const filtro = new URL(url);
  filtro.searchParams.delete('page');
  filtro.searchParams.sort();
  const chave = 'ml-coupon-activator:progress:0.3.2:' +
    encodeURIComponent(filtro.pathname + filtro.search);
  if (progresso) {
    registro.set(chave, JSON.stringify(progresso));
  }
  const visitadas = [];
  let frame = null;
  const criaElemento = (tipo) => {
    const el = {
      tipo,
      style: {},
      textContent: '',
      isConnected: true,
      append() {},
      appendChild() {},
      remove() {},
      addEventListener() {},
      removeEventListener() {},
      getAttribute() { return null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getClientRects() { return []; },
      closest() { return null; },
      matches() { return false; }
    };
    if (tipo === 'iframe') {
      frame = el;
      Object.defineProperty(frame, 'src', {
        get() { return visitadas.at(-1); },
        set(url) { visitadas.push(url); }
      });
    }
    return el;
  };
  const window = {
    addEventListener() {},
    removeEventListener() {}
  };
  const context = {
    window,
    location: { origin: 'https://www.mercadolivre.com.br', href: url },
    document: {
      body: criaElemento('body'),
      createElement: criaElemento,
      getElementById() { return null; }
    },
    localStorage: {
      getItem(k) { return registro.get(k) ?? null; },
      setItem(k, v) { registro.set(k, v); },
      removeItem(k) { registro.delete(k); }
    },
    console: {
      log() {}, warn() {}, error() {}
    },
    prompt(message, value) {
      assert.ok(message.includes('&page=X'), 'O prompt deve informar sobre acesso direto');
      return entrada === undefined ? value : entrada;
    },
    setTimeout, clearTimeout, performance, URL, Date
  };
  let codigo = retomarProgresso
    ? fonte.replace('retomarProgresso: false', 'retomarProgresso: true') : fonte;
  if (paginaFinal !== null)
    codigo = codigo.replace('paginaFinal: null', 'paginaFinal: ' + paginaFinal);
  if (paginaInicial !== null)
    codigo = codigo.replace('paginaInicial: null', 'paginaInicial: ' + paginaInicial);
  vm.runInNewContext(codigo, context, { timeout: 2000 });
  return {
    window, registro, visitadas,
    get frame() { return frame; },
    async aguardarNavegacao() {
      for (let i = 0; i < 20 && !visitadas.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    },
    encerrar() {
      window.fecharCupons?.();
    }
  };
}

test('script é JavaScript sintaticamente válido', () => {
  assert.doesNotThrow(() => new vm.Script(fonte));
});

test('página inicial 50 é aberta diretamente por &page=50', async () => {
  const nav = navegadorFalso('50');
  try {
    await nav.aguardarNavegacao();
    assert.equal(nav.visitadas.length, 1);
    const u = new URL(nav.visitadas[0]);
    assert.equal(u.searchParams.get('page'), '50');
    assert.equal(u.searchParams.get('all'), 'true');
    assert.equal(u.searchParams.get('source_page'), 'int_view_all');
  } finally {
    nav.encerrar();
  }
});

test('página 1 usa URL canônica sem parâmetro page desnecessário', async () => {
  const nav = navegadorFalso('1');
  try {
    await nav.aguardarNavegacao();
    assert.equal(nav.visitadas.length, 1);
    assert.equal(new URL(nav.visitadas[0]).searchParams.has('page'), false);
  } finally {
    nav.encerrar();
  }
});

test('progresso parcial sugere a página pendente sem percorrer anteriores', async () => {
  const nav = navegadorFalso(undefined, {
    versao: '0.3.2',
    origemFiltro: '/cupons/filter?all=true&source_page=int_view_all',
    ultimaConcluida: 28,
    paginaPendente: 29,
    idsTentados: ['data-coupon-id:abc'],
    semIdTentado: true,
    terminou: false
  }, { retomarProgresso: true });
  try {
    await nav.aguardarNavegacao();
    assert.equal(nav.visitadas.length, 1);
    assert.equal(new URL(nav.visitadas[0]).searchParams.get('page'), '29');
  } finally {
    nav.encerrar();
  }
});

test('cancelar prompt impede criação de iframe e cliques', () => {
  const nav = navegadorFalso(null);
  assert.equal(nav.frame, null);
  assert.equal(nav.visitadas.length, 0);
});

test('entrada de página fora do limite é rejeitada', async () => {
  const nav = navegadorFalso('201');
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(nav.frame, null);
  assert.equal(nav.visitadas.length, 0);
});

test('o código não usa fallback por índice para reencontrar cupons', () => {
  assert.doesNotMatch(fonte, /botoesDeCupons\(\)\s*\[\s*i\s*\]/);
  assert.match(fonte, /registrarTentativa\(item\)[\s\S]{0,180}botao\.click\(\)/);
});

test('status=inactive e source_page da aba são mantidos no iframe', async () => {
  const nav = navegadorFalso('42', null, {
    url: 'https://www.mercadolivre.com.br/cupons/filter?status=inactive&source_page=int_applied_filters&all=true&page=7'
  });
  try {
    await nav.aguardarNavegacao();
    const url = new URL(nav.visitadas[0]);
    assert.equal(url.searchParams.get('status'), 'inactive');
    assert.equal(url.searchParams.get('source_page'), 'int_applied_filters');
    assert.equal(url.searchParams.get('all'), 'true');
    assert.equal(url.searchParams.get('page'), '42');
  } finally {
    nav.encerrar();
  }
});

test('armazenamento de listagens com filtros diferentes usa chaves diferentes', async () => {
  const geral = navegadorFalso('1');
  const inativos = navegadorFalso('1', null, {
    url: 'https://www.mercadolivre.com.br/cupons/filter?status=inactive&all=true'
  });
  try {
    await geral.aguardarNavegacao();
    await inativos.aguardarNavegacao();
    const k1 = [...geral.registro.keys()][0];
    const k2 = [...inativos.registro.keys()][0];
    assert.ok(k1 && k2);
    assert.notEqual(k1, k2);
    assert.equal(JSON.parse(geral.registro.get(k1)).versao, '0.3.2');
    assert.equal(JSON.parse(inativos.registro.get(k2)).versao, '0.3.2');
  } finally {
    geral.encerrar();
    inativos.encerrar();
  }
});

test('com retomada desligada não herda a página pendente anterior', async () => {
  const nav = navegadorFalso(undefined, {
    versao: '0.3.2',
    origemFiltro: '/cupons/filter?all=true&source_page=int_view_all',
    ultimaConcluida: 28,
    paginaPendente: 29,
    idsTentados: ['data-coupon-id:antigo'],
    semIdTentado: false,
    terminou: false
  });
  try {
    await nav.aguardarNavegacao();
    assert.equal(new URL(nav.visitadas[0]).searchParams.has('page'), false);
    const valor = JSON.parse([...nav.registro.values()][0]);
    assert.deepEqual(valor.idsTentados, []);
    assert.equal(valor.ultimaConcluida, 0);
  } finally {
    nav.encerrar();
  }
});

test('paginaInicial configurada permite iniciar sem prompt', async () => {
  const nav = navegadorFalso(null, null, { paginaInicial: 33 });
  try {
    await nav.aguardarNavegacao();
    assert.equal(new URL(nav.visitadas[0]).searchParams.get('page'), '33');
  } finally {
    nav.encerrar();
  }
});

test('paginaFinal manual menor que a inicial impede criar iframe', async () => {
  const nav = navegadorFalso('50', null, { paginaFinal: 40 });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(nav.visitadas.length, 0);
  nav.encerrar();
});
