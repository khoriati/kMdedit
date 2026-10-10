// test/wysiwyg.test.mjs — ida e volta: markdown -> HTML editável -> markdown
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from './dom.mjs';
import { renderMarkdown } from '../lib/render.mjs';
import { htmlToMarkdown } from '../lib/convert.mjs';

const { parse, purify, document: doc } = ctx;
const roundtrip = (md) => {
  const html = renderMarkdown(md, { parse, purify, document: doc });
  const box = doc.createElement('div');
  box.innerHTML = html;
  return htmlToMarkdown(box);
};

test('wysiwyg: titulo, negrito e lista sobrevivem ao ciclo', () => {
  const out = roundtrip('# Titulo\n\nTexto **forte** e *itálico*.\n\n- item um\n- item dois\n');
  assert.match(out, /^# Titulo/m);
  assert.match(out, /\*\*forte\*\*/);
  assert.match(out, /^-\s+item um$/m);
});

test('wysiwyg: bloco mermaid volta a ser ```mermaid com o codigo-fonte', () => {
  const src = 'graph TD\n  A --> B';
  const out = roundtrip('Antes\n\n```mermaid\n' + src + '\n```\n\nDepois\n');
  assert.match(out, /```mermaid\ngraph TD\n {2}A --> B\n```/);
});

test('wysiwyg: tabela GFM e preservada', () => {
  const out = roundtrip('| a | b |\n|---|---|\n| 1 | 2 |\n');
  assert.match(out, /\| a \| b \|/);
  assert.match(out, /\| 1 \| 2 \|/);
});

test('wysiwyg: nao ha 3+ quebras de linha seguidas', () => {
  const out = roundtrip('# A\n\n\n\n# B\n');
  assert.doesNotMatch(out, /\n{3,}/);
});

test('wysiwyg: artefatos do contenteditable (<br> final, nbsp, separador zero) não vazam', () => {
  const box = doc.createElement('div');
  box.innerHTML = '<ul><li class="task"><input type="checkbox">primeira<br></li><li><input type="checkbox" checked>segunda<br></li></ul>'
    + '<p>fim com&nbsp;<strong>negrito</strong>\u200B e <code>c\u200Bod</code></p><pre><code>a\u00A0b\n</code></pre>';
  const out = htmlToMarkdown(box);
  assert.equal(out, '- [ ] primeira\n- [x] segunda\n\nfim com **negrito** e `cod`\n\n```\na\u00A0b\n```\n');
});
