'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'mercadolivre-coupon-activator.js'), 'utf8'
);

function config() {
  const match = script.match(/  const CONFIG = (\{[\s\S]+?\n  \});/);
  assert.ok(match, 'CONFIG não encontrado');
  return new Function('return (' + match[1] + ')')();
}

function extrair(nome, proximo, parametros) {
  const inicio = script.indexOf('  function ' + nome + '(');
  const fim = script.indexOf(proximo, inicio);
  assert.ok(inicio >= 0 && fim > inicio, 'Função não encontrada: ' + nome);
  return new Function(...parametros, script.slice(inicio, fim) + '\nreturn ' + nome + ';');
}

function detector({ ultima = 111, filtro = 'all=true', dots = true,
  href = null, aria = null, dominio = 'https://www.mercadolivre.com.br' } = {}) {
  const caminho = '/cupons/filter';
  const rotulo = String(ultima);
  const primeiro = {
    innerText: '1',
    getAttribute(nome) {
      if (nome === 'href') return dominio + caminho + '?' + filtro + '&page=1';
      return null;
    }
  };
  const ultimo = {
    innerText: rotulo,
    getAttribute(nome) {
      if (nome === 'href') return href || dominio + caminho + '?' + filtro + '&page=' + rotulo;
      if (nome === 'aria-label') return aria ?? 'Vá para a página ' + rotulo;
      return null;
    }
  };
  const lista = {
    // As reticências são três <i> sem texto. O número final é outro <li>.
    textContent: 'Anterior 1 2 3 4 5 6 7 8 9 ' + rotulo + ' Próximo',
    querySelectorAll(seletor) {
      if (seletor === 'a[data-andes-pagination-item="true"]') return [primeiro, ultimo];
      if (seletor === 'li.andes-pagination__dots + li a[data-andes-pagination-item="true"]')
        return dots ? [ultimo] : [];
      return [];
    },
    querySelector() { return null; }
  };
  return {
    location: { href: dominio + caminho + '?' + filtro },
    querySelectorAll(seletor) {
      if (seletor === 'ul[data-andes-pagination="true"],ul.andes-pagination')
        return [lista];
      return [];
    }
  };
}

function paginaFinal(doc, inicial = 1) {
  const gerar = extrair('paginaFinalConhecida',
    '  // Obter a última página na aba ORIGINAL',
    ['paginaInicial', 'CONFIG', 'texto', 'URL', 'console']);
  const texto = el => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  return gerar(inicial, config(), texto, URL, { log() {} })(doc);
}

test('CONFIG da 0.3.2 começa do zero e permite desativar prompt de página', () => {
  const c = config();
  assert.equal(c.retomarProgresso, false);
  assert.equal(c.paginaInicial, null);
  assert.equal(c.paginaFinal, null);
  assert.equal(c.maxPaginas, 200);
  assert.ok(c.limiteMaximoPaginas >= 111);
});

test('página X preserva filtros da aba e substitui page anterior', () => {
  const origem = new URL('https://www.mercadolivre.com.br/cupons/filter?all=true&status=inactive&source_page=int_applied_filters&page=9');
  origem.searchParams.delete('page');
  const criar = extrair('urlPagina', '  function paginaFinalConhecida(', ['urlBase', 'URL']);
  const urlPagina = criar(origem, URL);
  const pagina42 = new URL(urlPagina(42));
  assert.equal(pagina42.searchParams.get('status'), 'inactive');
  assert.equal(pagina42.searchParams.get('source_page'), 'int_applied_filters');
  assert.equal(pagina42.searchParams.get('page'), '42');
  assert.equal(new URL(urlPagina(1)).searchParams.has('page'), false);
});

test('paginador Andes com <li><i> confirma total 111 sem reticências textuais', () => {
  const doc = detector({ ultima: 111 });
  assert.equal(paginaFinal(doc), 111);
});

test('paginador de listagem status=inactive confirma 93', () => {
  assert.equal(paginaFinal(detector({ ultima: 93, filtro: 'all=true&status=inactive' })), 93);
});

test('não confunde último link da faixa local com total sem li de reticências', () => {
  assert.equal(paginaFinal(detector({ ultima: 9, dots: false })), null);
});

test('ignora links de última página com href incorreto ou aria discordante', () => {
  assert.equal(paginaFinal(detector({ ultima: 93,
    href: 'https://www.mercadolivre.com.br/cupons/filter?all=true&page=92' })), null);
  assert.equal(paginaFinal(detector({ ultima: 93, aria: 'Vá para a página 92' })), null);
});

test('ignora link final apontando a outro domínio', () => {
  assert.equal(paginaFinal(detector({ ultima: 93,
    href: 'https://example.invalid/cupons/filter?all=true&page=93' })), null);
});

test('controle Próxima da estrutura Andes está entre os seletores sequenciais', () => {
  assert.match(script, /a\[data-andes-pagination-control="next"\]/);
});

test('descobre total antes do iframe e valida que o fim não foi antecipado', () => {
  const descoberta = script.indexOf('estado.ultimaPaginaConhecida = await descobrirPaginaFinal()');
  const abertura = script.indexOf('if (!(await carregarPrimeiraPagina()))');
  assert.ok(descoberta > 0 && abertura > descoberta);
  assert.match(script, /Botão Próxima indisponível na página/);
  assert.match(script, /Última página confirmada da listagem alcançada/);
});

test('progresso é isolado por URL ordenada e retomada é opt-in', () => {
  assert.match(script, /filtroAtual\.searchParams\.sort\(\)/);
  assert.match(script, /encodeURIComponent\(origemFiltro\)/);
  assert.match(script, /valor\.origemFiltro !== origemFiltro/);
  assert.match(script, /CONFIG\.retomarProgresso \? lerRegistro\(\) : null/);
  assert.match(script, /if \(!retomarPagina\) salvarProgresso\(\)/);
});
