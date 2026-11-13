'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'mercadolivre-coupon-activator-parallel.js'), 'utf8'
);

function extrairDivisao() {
  const match = script.match(/  function dividirEmBlocos\([\s\S]+?\n  }\n\n  function urlPagina\(/);
  assert.ok(match, 'Função de divisão de blocos não encontrada');
  return new Function(match[0].replace(/\n\n  function urlPagina\($/, '') +
    '\nreturn dividirEmBlocos;')();
}

function config() {
  const match = script.match(/  const CONFIG = (\{[\s\S]+?\n  \});/);
  assert.ok(match, 'CONFIG não encontrada');
  return new Function('return (' + match[1] + ')')();
}

test('sintaxe JavaScript válida', () => {
  assert.doesNotThrow(() => new vm.Script(script));
});

test('parâmetros iniciais são 10 blocos e 5 processos', () => {
  const conf = config();
  assert.equal(conf.numeroBlocos, 10);
  assert.equal(conf.numeroProcessos, 5);
  assert.equal(conf.paginaInicial, 1);
  assert.equal(conf.paginaFinal, null);
});

test('parâmetros atuais recuperados da branch: intervalos personalizados de 250 ms', () => {
  const conf = config();
  assert.equal(conf.intervaloGlobalCliquesMs, 250);
  assert.equal(conf.esperaAposCliqueMs, 2000);
  assert.equal(conf.intervaloGlobalNavegacoesMs, 250);
  assert.equal(conf.esperaAposPaginaMs, 2000);
  assert.equal(conf.esperaConfirmacaoMs, 2000);
  assert.equal(conf.timeoutPaginaMs, 45000);
});

test('111 páginas em 10 blocos: distribuição correta, sem sobreposição', () => {
  const blocos = extrairDivisao()(1, 111, 10);
  assert.equal(blocos.length, 10);
  assert.equal(blocos[0].inicio, 1);
  assert.equal(blocos[0].fim, 12);
  assert.equal(blocos[9].inicio, 101);
  assert.equal(blocos[9].fim, 111);
  const paginas = blocos.flatMap(b =>
    Array.from({ length: b.fim - b.inicio + 1 }, (_, i) => b.inicio + i)
  );
  assert.deepEqual(paginas, Array.from({ length: 111 }, (_, i) => i + 1));
  assert.deepEqual(blocos.map(b => b.fim - b.inicio + 1),
    [12, 11, 11, 11, 11, 11, 11, 11, 11, 11]);
});

test('início em 83 e fim em 111 mantém 29 páginas distintas', () => {
  const blocos = extrairDivisao()(83, 111, 10);
  assert.equal(blocos.length, 10);
  assert.equal(blocos[0].inicio, 83);
  assert.equal(blocos.at(-1).fim, 111);
  const nums = blocos.flatMap(b =>
    Array.from({ length: b.fim - b.inicio + 1 }, (_, i) => b.inicio + i)
  );
  assert.deepEqual(nums, Array.from({ length: 29 }, (_, i) => i + 83));
});

test('mais blocos que páginas não cria blocos vazios', () => {
  const blocos = extrairDivisao()(12, 14, 10);
  assert.equal(blocos.length, 3);
  assert.deepEqual(blocos.map(x => [x.inicio, x.fim]),
    [[12, 12], [13, 13], [14, 14]]);
});

test('divisão de páginas rejeita faixas inválidas', () => {
  const dividir = extrairDivisao();
  assert.throws(() => dividir(10, 9, 5));
  assert.throws(() => dividir(1, 10, 0));
  assert.throws(() => dividir(0, 10, 2));
});

test('fila global espaça os inícios dos cliques e as navegações', () => {
  assert.match(script, /filas:\s*\{\s*clique:\s*Promise\.resolve\(\),\s*navegacao:\s*Promise\.resolve\(\)\s*\}/);
  assert.match(script, /agendar\('clique',\s*CONFIG\.intervaloGlobalCliquesMs/);
  assert.match(script, /agendar\('navegacao',\s*CONFIG\.intervaloGlobalNavegacoesMs/);
  assert.match(script, /const clique = await agendar\('clique',[\s\S]+?\n      \}\);[\s\S]*?const resultado = await confirmarClique\(/);
});

test('persistência é feita antes do clique e por página', () => {
  assert.match(script, /const salvo = registroPagina\(pagina\)/);
  assert.match(script, /salvar\(\);[\s\S]{0,200}atual\.click\(\)/);
  assert.match(script, /if \(salvo\.concluida\)/);
});

test('recusas HTTP e erros visíveis interrompem o experimento', () => {
  assert.match(script, /\[401,\s*403,\s*429\]\.includes\(status\)/);
  assert.match(script, /verificarAvisos\(doc\)/);
  assert.match(script, /interromper\('Bloco '/);
});

test('última página não é inferida do maior número visível', () => {
  assert.match(script, /paginaFinalConhecida/);
  assert.match(script, /'a\[rel="last"\]/);
  assert.match(script, /Informe o número da última página/);
});

test('controle não é clicado se desatualizado após a espera global', () => {
  assert.match(script, /const atual = resolverControle\(docAtual, item\)/);
  assert.match(script, /if \(!paginaCorreta\(docAtual, pagina\)\)/);
});

test('a confirmação ocorre fora da fila global sem bloquear outros trabalhadores', async () => {
  const schedulerMatch = script.match(/  function agendar\(tipo, intervalo, acao\) \{[\s\S]+?\n  \}\n\n  function el\(/);
  assert.ok(schedulerMatch, 'agendador não localizado');
  const schedulerBody = schedulerMatch[0].replace(/\n\n  function el\($/, '');
  let tempo = 0;
  const estado = {
    filas: { clique: Promise.resolve(), navegacao: Promise.resolve() },
    proximas: { clique: 0, navegacao: 0 },
    encerrado: false
  };
  const agendar = new Function('estado', 'aguardarAtivo', 'ativoMs', 'esperar',
    schedulerBody + '\nreturn agendar;')(
    estado,
    async () => true,
    () => tempo,
    async ms => { tempo += ms; return true; }
  );
  const instantes = [];
  const a = agendar('clique', 250, () => {
    instantes.push(tempo);
    return { worker: 1 };
  });
  const b = agendar('clique', 250, () => {
    instantes.push(tempo);
    return { worker: 2 };
  });
  assert.equal((await a).worker, 1);
  assert.equal((await b).worker, 2);
  assert.deepEqual(instantes, [0, 250]);
});

test('mínimo pós-clique de 2s considera a espera já gasta na confirmação', () => {
  assert.match(script, /CONFIG\.esperaAposCliqueMs - \(ativoMs\(\) - clique\.momentoClique\)/);
  assert.match(script, /restanteAposClique > 0 && !\(await esperar\(restanteAposClique\)\)/);
  assert.doesNotMatch(script, /CONFIG\.intervaloAposCliqueMs/);
  assert.match(script, /const resultado = await confirmarClique\([\s\S]+?restanteAposClique/);
});

function extrairValidador() {
  const match = script.match(/  function validarConfig\(config\) \{[\s\S]+?\n  }\n\n  const errosConfig/);
  assert.ok(match, 'Validador de configuração não encontrado');
  const trecho = match[0].replace(/\n\n  const errosConfig$/, '');
  return new Function(trecho + '\nreturn validarConfig;')();
}

test('CONFIG atual com 250 ms é aceito pelo mesmo validador do script', () => {
  const erros = extrairValidador()(config());
  assert.deepEqual(erros, []);
});

test('intervalos de 250 ms são aceitos sem aviso desnecessário', () => {
  assert.deepEqual(extrairValidador()(config()), []);
  assert.doesNotMatch(script, /Intervalos globais agressivos/);
});

test('CONFIG inválido informa especificamente os campos incorretos', () => {
  const validar = extrairValidador();
  const c = config();
  c.intervaloGlobalCliquesMs = 0;
  c.intervaloGlobalNavegacoesMs = -1;
  c.numeroProcessos = 21;
  const erros = validar(c);
  assert.ok(erros.some(x => x.startsWith('intervaloGlobalCliquesMs:')));
  assert.ok(erros.some(x => x.startsWith('intervaloGlobalNavegacoesMs:')));
  assert.ok(erros.some(x => x.startsWith('numeroProcessos:')));
  assert.equal(erros.length, 3);
});

test('intervalos continuam parametrizáveis (1, 250 e 1500 ms)', () => {
  const validar = extrairValidador();
  for (const valor of [1, 250, 1500]) {
    const c = config();
    c.intervaloGlobalCliquesMs = valor;
    c.intervaloGlobalNavegacoesMs = valor;
    assert.deepEqual(validar(c), []);
  }
  const c = config();
  c.intervaloGlobalCliquesMs = 1.5;
  assert.ok(validar(c).some(x => x.includes('intervaloGlobalCliquesMs')));
});


function extrairDetectorFinal() {
  const inicio = script.indexOf('  function paginaFinalConhecida(doc) {');
  const fim = script.indexOf('  function criarTrabalhador(id) {', inicio);
  assert.ok(inicio >= 0 && fim > inicio, 'Detector de última página não localizado');
  const codigo = script.slice(inicio, fim);
  return new Function('CONFIG', 'texto', 'URL',
    codigo + '\nreturn paginaFinalConhecida;')(
    config(),
    el => String(el?.innerText || el?.textContent || '').trim(),
    URL
  );
}

function simulacaoPaginador({ rotulos = [], reticencias = false, ultimo = null,
  proxima = true, textoNav = '' } = {}) {
  const link = (rotulo, pagina) => ({
    innerText: String(rotulo),
    textContent: String(rotulo),
    getAttribute(nome) {
      return nome === 'href' && pagina !== null
        ? '/cupons/filter?all=true&page=' + pagina : null;
    }
  });
  const links = rotulos.map(n => link(n, n));
  const ultimoLink = ultimo === null ? null : link(ultimo, ultimo);
  const proximoLink = proxima ? {
    getAttribute() { return null; },
    hasAttribute() { return false; },
    closest() { return null; }
  } : null;
  const area = {
    innerText: textoNav || rotulos.join(' ') + (reticencias ? ' ...' : ''),
    textContent: textoNav || rotulos.join(' ') + (reticencias ? ' ...' : ''),
    querySelector(seletor) {
      if (seletor.includes('a[rel="last"]')) return ultimoLink;
      if (seletor.includes('li.andes-pagination__button--next a')) return proximoLink;
      return null;
    },
    querySelectorAll(seletor) {
      return seletor.includes('a, button') ? links : [];
    }
  };
  return {
    location: { href: 'https://www.mercadolivre.com.br/cupons/filter?all=true&page=1' },
    querySelectorAll(seletor) {
      if (seletor.includes('.andes-pagination')) return [area];
      if (seletor === 'nav') return [area];
      return [];
    }
  };
}

test('paginação 1 ... 111 é dividida em 10 blocos, sem reduzir a somente 1', () => {
  const detectar = extrairDetectorFinal();
  const doc = simulacaoPaginador({
    rotulos: [1,2,3,4,5,6,7,111],
    textoNav: '1 2 3 4 5 6 7 ... 111 Próximo'
  });
  assert.equal(detectar(doc), 111);
  assert.equal(extrairDivisao()(1, detectar(doc), 10).length, 10);
});

test('texto genérico 1 de 1 não é tratado como número total de páginas', () => {
  const detectar = extrairDetectorFinal();
  const doc = simulacaoPaginador({ rotulos: [1,2,3,4,5,6,7], proxima: true,
    textoNav: '1 de 1' });
  assert.equal(detectar(doc), null);
});

test('pager local 1..7 sem indicação explícita de última página exige confirmação', () => {
  assert.equal(extrairDetectorFinal()(
    simulacaoPaginador({ rotulos: [1,2,3,4,5,6,7], proxima: true })
  ), null);
});

test('link explícito de última página 111 permite iniciar todos os blocos', () => {
  assert.equal(extrairDetectorFinal()(
    simulacaoPaginador({ rotulos: [1,2,3], ultimo: 111 })
  ), 111);
});

test('última página 1 só é aceita quando explicitamente informada e sem Próxima', () => {
  const detectar = extrairDetectorFinal();
  assert.equal(detectar(simulacaoPaginador({
    rotulos: [1], ultimo: 1, proxima: false
  })), 1);
  assert.equal(detectar(simulacaoPaginador({
    rotulos: [1], ultimo: 1, proxima: true
  })), null);
});

test('cinco trabalhadores utilizam cinco colunas de altura total', () => {
  const c = config();
  assert.equal(c.colunasPainel, 5);
  assert.equal(c.numeroProcessos, 5);
  assert.equal(c.escalaIframe, 0.7);
  assert.match(script, /grid-template-columns:repeat\('/);
  assert.match(script, /colunas \+ ',minmax\(0,1fr\)/);
  assert.match(script, /grid-auto-rows:minmax\(0,1fr\)/);
  assert.match(script, /areaIframe\.appendChild\(frame\)/);
  assert.match(script, /box\.append\(rotulo, areaIframe\)/);
});

test('sem alertas de intervalo baixo; erros HTTP continuam protegidos', () => {
  assert.doesNotMatch(script, /Intervalos globais agressivos/);
  assert.match(script, /\[401,\s*403,\s*429\]\.includes\(status\)/);
});


function extrairFonteDescoberta() {
  const inicio = script.indexOf('  async function descobrirPaginaFinal() {');
  const fim = script.indexOf('  function criarTrabalhador(id) {', inicio);
  assert.ok(inicio >= 0 && fim > inicio, 'Pré-processamento não localizado');
  return script.slice(inicio, fim);
}

test('página principal com 1..9 ... 93 detecta 93, mesmo sem link para 93', () => {
  const detectar = extrairDetectorFinal();
  const doc = simulacaoPaginador({
    rotulos: [1,2,3,4,5,6,7,8,9],
    textoNav: '1 2 3 4 5 6 7 8 9 ... 93 Próximo'
  });
  assert.equal(detectar(doc), 93);
  assert.equal(extrairDivisao()(1, 93, 10).length, 10);
});

test('páginas locais 1..9 seguidas de reticências sem total não resultam em falso 9', () => {
  const detectar = extrairDetectorFinal();
  const doc = simulacaoPaginador({
    rotulos: [1,2,3,4,5,6,7,8,9],
    textoNav: '1 2 3 4 5 6 7 8 9 ... Próximo'
  });
  assert.equal(detectar(doc), null);
});

test('último número de paginação deve ser isolado após reticências', () => {
  const detectar = extrairDetectorFinal();
  const doc = simulacaoPaginador({
    rotulos: [1,2,3,4,5],
    textoNav: '1 ... 3 4 5 Próximo'
  });
  assert.equal(detectar(doc), null);
});

test('descoberta é realizada na aba principal antes da criação de qualquer iframe', async () => {
  const doc = simulacaoPaginador({
    rotulos: [1,2,3,4,5,6,7,8,9],
    textoNav: '1 2 3 4 5 6 7 8 9 ... 93 Próximo'
  });
  doc.readyState = 'complete';
  doc.documentElement = { scrollHeight: 1500 };
  doc.body = { scrollHeight: 1600 };

  const scrolls = [];
  const janela = {
    scrollX: 12, scrollY: 20,
    scrollTo(x,y) { scrolls.push([x,y]); }
  };
  let tempo = 0;
  const c = config();
  const detectar = extrairDetectorFinal();
  const descobrir = new Function(
    'location', 'origem', 'CONFIG', 'console', 'document', 'estado',
    'ativoMs', 'esperar', 'window', 'paginaFinalConhecida',
    extrairFonteDescoberta() + '\nreturn descobrirPaginaFinal;'
  )(
    { href: doc.location.href }, 'https://www.mercadolivre.com.br',
    c, { log() {}, warn() {} }, doc, { encerrado: false },
    () => tempo, async ms => { tempo += ms; return true; },
    janela, detectar
  );
  assert.equal(await descobrir(), 93);
  assert.deepEqual(scrolls, [[0,1600],[12,20]]);
  const inicioProcessamento = script.indexOf('paginaFinal = await descobrirPaginaFinal()');
  const painel = script.indexOf('document.body.appendChild(raiz)');
  const frames = script.indexOf('(_, i) => criarTrabalhador(i + 1)');
  assert.ok(inicioProcessamento > -1 && painel > inicioProcessamento);
  assert.ok(frames > painel);
});

test('aba fora da listagem de cupons não prossegue criando trabalhadores', async () => {
  const descobrir = new Function(
    'location','origem','CONFIG',
    extrairFonteDescoberta() + '\nreturn descobrirPaginaFinal;'
  )(
    { href: 'https://www.mercadolivre.com.br/meu-perfil' },
    'https://www.mercadolivre.com.br',
    config()
  );
  await assert.rejects(descobrir(), /Abra a listagem principal de cupons/);
});

test('quando a descoberta falha, a confirmação manual ocorre antes dos iframes', () => {
  const inicio = script.indexOf('    let paginaFinal = CONFIG.paginaFinal;');
  const source = script.slice(inicio);
  assert.match(source, /paginaFinal = await descobrirPaginaFinal\(\)/);
  assert.match(source, /if \(paginaFinal === null\)/);
  assert.match(source, /Informe o número da última página para criar os blocos/);
  assert.ok(source.indexOf('prompt(') < source.indexOf('document.body.appendChild(raiz)'));
  assert.ok(source.indexOf('estado.blocos = dividirEmBlocos') <
    source.indexOf('document.body.appendChild(raiz)'));
  assert.doesNotMatch(source, /paginaFinal = 1;/);
});


test('paginador sem classe .andes-pagination identifica 93 via ul responsivo', () => {
  const detectar = extrairDetectorFinal();
  const paginacao = {
    tagName: 'UL',
    innerText: '1 2 3 4 5 6 7 8 9 … 93 Próximo',
    textContent: '1 2 3 4 5 6 7 8 9 … 93 Próximo',
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const doc = {
    location: { href: 'https://www.mercadolivre.com.br/cupons/filter?all=true&status=inactive' },
    querySelectorAll(seletor) {
      if (seletor.includes("ul,ol") || seletor.includes("'ul'")) return [paginacao];
      return [];
    }
  };
  assert.equal(detectar(doc), 93);
});

test('paginador sem classes reconhecidas é descoberto pelo ancestral de Próximo', () => {
  const detectar = extrairDetectorFinal();
  const container = {
    innerText: '1 2 3 … 93 Próximo',
    textContent: '1 2 3 … 93 Próximo',
    parentElement: null,
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const proximo = {
    innerText: 'Próximo',
    textContent: 'Próximo',
    parentElement: container
  };
  const doc = {
    location: { href: 'https://www.mercadolivre.com.br/cupons/filter?all=true' },
    querySelectorAll(seletor) {
      if (seletor === 'a,button,[role="button"],span,li') return [proximo];
      return [];
    }
  };
  assert.equal(detectar(doc), 93);
});

test('não confunde paginação local sem reticências com total de páginas', () => {
  const detectar = extrairDetectorFinal();
  const paginacao = {
    innerText: 'Anterior 1 2 3 4 5 6 7 8 9 Próximo',
    textContent: 'Anterior 1 2 3 4 5 6 7 8 9 Próximo',
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const doc = {
    location: { href: 'https://www.mercadolivre.com.br/cupons/filter?all=true' },
    querySelectorAll(seletor) {
      if (seletor.includes("ul,ol")) return [paginacao];
      return [];
    }
  };
  assert.equal(detectar(doc), null);
});

test('trabalhadores preservam filtro status=inactive da aba original', () => {
  const trecho = script.match(/  function urlPagina\(numero\) \{[\s\S]*?\n  \}/);
  assert.ok(trecho, 'Função de navegação não encontrada');
  const urlBase = new URL(
    'https://www.mercadolivre.com.br/cupons/filter?status=inactive&source_page=int_applied_filters&all=true'
  );
  const urlPagina = new Function('urlBase', 'CONFIG', 'URL',
    trecho[0] + '\nreturn urlPagina;'
  )(urlBase, config(), URL);
  const resultado = new URL(urlPagina(42));
  assert.equal(resultado.searchParams.get('status'), 'inactive');
  assert.equal(resultado.searchParams.get('source_page'), 'int_applied_filters');
  assert.equal(resultado.searchParams.get('all'), 'true');
  assert.equal(resultado.searchParams.get('page'), '42');
  assert.notEqual(resultado.searchParams.get('source_page'), 'int_view_all');
});

test('retomada distingue listagens com filtros diferentes', () => {
  assert.match(script, /origemFiltro = filtroAtual\.pathname \+ filtroAtual\.search/);
  assert.match(script, /encodeURIComponent\(origemFiltro\)/);
  assert.match(script, /registroAnterior\.origemFiltro === origemFiltro/);
  assert.match(script, /versao: 'parallel-v2'/);
});

test('diagnóstico da paginação informa URL, largura e candidatos', () => {
  assert.match(script, /Diagnóstico de paginação não reconhecida/);
  assert.match(script, /larguraViewport: window\.innerWidth/);
  assert.match(script, /candidatos/);
});


// Modelo reduzido do HTML entregue pelo usuário. Os números 111 e 93
// são exemplos de listas diferentes. Nenhum token ou dado de sessão é usado.
function modeloAndes({ ultima = 111, filtro = 'all=true', mostrarDots = true,
  urlFinal = null, ariaFinal = null, dominioFinal = null } = {}) {
  const base = 'https://www.mercadolivre.com.br/cupons/filter';
  const hrefFinal = urlFinal || (dominioFinal || base) +
    '?' + filtro + '&page=' + ultima;
  const primeiro = {
    innerText: '1',
    getAttribute(nome) {
      if (nome === 'href') return base + '?' + filtro + '&page=1';
      if (nome === 'aria-label') return 'Vá para a página 1';
      return null;
    }
  };
  const ultimo = {
    innerText: String(ultima),
    getAttribute(nome) {
      if (nome === 'href') return hrefFinal;
      if (nome === 'aria-label') return ariaFinal ?? 'Vá para a página ' + ultima;
      return null;
    }
  };
  const ul = {
    // No DOM verdadeiro as reticências são <li> com três <i>.
    // O texto do paginador não tem nem "..." nem "…".
    innerText: 'Anterior 1 2 3 4 5 6 7 8 9 ' + ultima + ' Próximo',
    textContent: 'Anterior 1 2 3 4 5 6 7 8 9 ' + ultima + ' Próximo',
    querySelectorAll(seletor) {
      if (seletor === 'a[data-andes-pagination-item="true"]')
        return [primeiro, ultimo];
      if (seletor === 'li.andes-pagination__dots + li a[data-andes-pagination-item="true"]')
        return mostrarDots ? [ultimo] : [];
      return [];
    },
    querySelector() { return null; }
  };
  return {
    location: { href: base + '?' + filtro },
    querySelectorAll(seletor) {
      if (seletor === 'ul[data-andes-pagination="true"],ul.andes-pagination')
        return [ul];
      if (seletor.includes('.andes-pagination')) return [ul];
      return [];
    }
  };
}

test('DOM real: dots em <li><i> sem reticências textuais detecta 111', () => {
  const doc = modeloAndes({ ultima: 111 });
  const area = doc.querySelectorAll('ul[data-andes-pagination="true"],ul.andes-pagination')[0];
  assert.doesNotMatch(area.textContent, /\.{3}|…/);
  assert.equal(extrairDetectorFinal()(doc), 111);
  assert.equal(extrairDivisao()(1, 111, 10).length, 10);
});

test('DOM real: última página 93 em listagem com status=inactive', () => {
  const doc = modeloAndes({
    ultima: 93, filtro: 'status=inactive&all=true'
  });
  assert.equal(extrairDetectorFinal()(doc), 93);
  assert.equal(extrairDivisao()(1, 93, 10).length, 10);
});

test('DOM real: sem li de reticências não toma último link como total', () => {
  assert.equal(extrairDetectorFinal()(modeloAndes({
    ultima: 9, mostrarDots: false
  })), null);
});

test('DOM real: rejeita número diferente entre href e rótulo', () => {
  assert.equal(extrairDetectorFinal()(modeloAndes({
    ultima: 93,
    urlFinal: 'https://www.mercadolivre.com.br/cupons/filter?all=true&page=92'
  })), null);
});

test('DOM real: rejeita aria-label discordante com página final', () => {
  assert.equal(extrairDetectorFinal()(modeloAndes({
    ultima: 93, ariaFinal: 'Vá para a página 92'
  })), null);
});

test('DOM real: não confia em links externos na paginação', () => {
  assert.equal(extrairDetectorFinal()(modeloAndes({
    ultima: 93,
    dominioFinal: 'https://exemplo.invalid/cupons/filter'
  })), null);
});
