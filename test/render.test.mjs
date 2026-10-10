// test/render.test.mjs — RENDERIZACAO markdown + graficos Mermaid
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
// DOMPurify e instanciado no harness (dom.js) p/ expor DOMParser no node.
import { ctx } from './dom.mjs';
import {
  renderMarkdown, countMermaidBlocks, countMermaidDivs,
} from '../lib/render.mjs';

const { parse, purify, document: doc } = ctx;

// Documento com 3 tipos de grafo mermaid suportados pelo engine.
const MD_MERMAID = [
  '# Título do Doc',
  '',
  '## Grafo de sequência',
  '',
  '```mermaid',
  'sequenceDiagram',
  '  Alice->>Bob: oi',
  '  Bob-->>Alice: ola',
  '```',
  '',
  '## Fluxo (flowchart)',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Start]-->B{decide}',
  '  B-->|y|C[go]',
  '  B-->|n|D[stop]',
  '```',
  '',
  '## Estado (state diagram)',
  '',
  '```mermaid',
  'stateDiagram-v2',
  '  [*] --> Open',
  '  Open --> [*]',
  '```',
  '',
  'Texto encerrador **final**.',
].join('\n');

test('mermaid: 3 blocos sao convertidos em <div class="mermaid">', () => {
  assert.equal(countMermaidBlocks(MD_MERMAID, ctx), 3);
  const html = renderMarkdown(MD_MERMAID, ctx);
  assert.match(html, /class="mermaid"/);
  assert.doesNotMatch(html, /language-mermaid/, 'codigo mermaid nao deve vazar como <code>');
});

test('mermaid: codigo-fonte e preservado dentro do <div class="mermaid">', () => {
  const html = renderMarkdown(MD_MERMAID, ctx);
  const container = doc.createElement('div');
  container.innerHTML = html;
  const divs = container.querySelectorAll('div.mermaid');
  assert.equal(divs.length, 3);
  assert.match(divs[0].textContent, /sequenceDiagram/);
  assert.match(divs[1].textContent, /flowchart LR/);
  assert.match(divs[2].textContent, /stateDiagram-v2/);
});

test('mermaid: countMermaidDivs sobre HTML ja-processado', () => {
  const html = renderMarkdown(MD_MERMAID, ctx);
  const container = doc.createElement('div');
  container.innerHTML = html;
  assert.equal(countMermaidDivs(doc, container), 3);
});

test('XSS: <script> e removido pela sanizacao (seguranca)', () => {
  const src = '```js\n<script>window.location="http://evil"\n</script>\nconsole.log(1)\n```';
  const html = renderMarkdown(src, ctx);
  assert.doesNotMatch(html, /<script>/i, 'script deve ser removido');
});

test('markdown: titulos, listas, negrito, link, tabela', () => {
  const html = renderMarkdown(
    '# H1\n## H2\n- a\n- b\n**neg** [link](http://x)\n| a | b |\n| - | - |\n| 1 | 2 |',
    ctx
  );
  assert.match(html, /<h1>H1<\/h1>/);
  assert.match(html, /<h2>H2<\/h2>/);
  assert.match(html, /<li>a<\/li>/);
  assert.match(html, /<strong>neg<\/strong>/);
  assert.match(html, /href="http:\/\/x"/);
  assert.match(html, /<table/);
});

test('mermaid: bloco vazio nao vira grafico', () => {
  assert.equal(countMermaidBlocks('```\n\n```', ctx), 0);
});

test('renderMarkdown: entrada nao-string lança TypeError', () => {
  assert.throws(() => renderMarkdown(null, ctx), TypeError);
  assert.throws(() => renderMarkdown(123, ctx), TypeError);
});

test('render: parser que lança não derruba a renderização; mostra aviso e a fonte', () => {
  const boom = () => { throw new Error('parser quebrou'); };
  const html = renderMarkdown('# oi\n<b>x</b>', { ...ctx, parse: boom });
  const box = doc.createElement('div');
  box.innerHTML = html;
  const err = box.querySelector('.render-error');
  assert.ok(err, 'bloco de erro presente');
  assert.match(err.querySelector('.render-error-title').textContent, /parser quebrou/);
  assert.equal(err.querySelector('pre').textContent, '# oi\n<b>x</b>');
  assert.equal(box.querySelector('b'), null, 'fonte vai como texto, não como HTML');
});

test('render: bloco mermaid guarda a fonte em data-src e não é editável no WYSIWYG', () => {
  const html = renderMarkdown('```mermaid\n  graph TD\n  A-->B\n```', ctx);
  const box = doc.createElement('div');
  box.innerHTML = html;
  const div = box.querySelector('div.mermaid');
  assert.equal(div.getAttribute('data-src'), 'graph TD\n  A-->B');
});
