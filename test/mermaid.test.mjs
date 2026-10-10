// test/mermaid.test.mjs — renderização de Mermaid à prova de falhas
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctx, doc } from './dom.mjs';
import { renderMarkdown } from '../lib/render.mjs';
import { htmlToMarkdown } from '../lib/convert.mjs';
import {
  renderMermaidBlocks, describeRenderError, cleanupMermaid, ensureSandbox, usableWidth,
  withTimeout, SANDBOX_ID, ERROR_CLASS, DEFAULT_WIDTH,
} from '../lib/mermaid.mjs';

// Dublê do mermaid: imita o comportamento da v10, inclusive o resíduo no <body>
// quando o diagrama é inválido.
function fakeMermaid({ failOn = /invalido/, hangOn = /trava/, throwValue } = {}) {
  const calls = { parse: 0, render: 0 };
  return {
    calls,
    async parse(src, { suppressErrors } = {}) {
      calls.parse++;
      if (failOn.test(src)) {
        if (suppressErrors) return false;
        throw throwValue ?? new Error('Parse error on line 2:\n...esperado');
      }
      return true;
    },
    async render(id, src, container) {
      calls.render++;
      calls.containerWidth = container && container.style.width;
      const tmp = doc.createElement('div');
      tmp.id = 'd' + id;
      (container ?? doc.body).appendChild(tmp);
      if (hangOn.test(src)) return new Promise(() => {}); // nunca resolve
      if (failOn.test(src)) throw new Error('nao deveria chegar ao render');
      tmp.remove();
      return { svg: `<svg id="${id}"><g>${src.length}</g></svg>` }; // o SVG real leva o mesmo id
    },
  };
}

function rootFor(md) {
  const root = doc.createElement('article');
  root.innerHTML = renderMarkdown(md, ctx);
  return root;
}

const MD = (body) => '# T\n\n```mermaid\n' + body + '\n```\n\nfim\n';

test('mermaid: diagrama válido vira SVG e sandbox fica limpo', async () => {
  const root = rootFor(MD('graph TD\n  A --> B'));
  const r = await renderMermaidBlocks(root, { mermaid: fakeMermaid(), document: doc });
  assert.deepEqual(r, { rendered: 1, failed: 0, aborted: false });
  assert.ok(root.querySelector('.mermaid svg'), 'o SVG final (com id igual ao do render) deve permanecer');
  assert.equal(root.querySelector('.mermaid').getAttribute('contenteditable'), 'false');
  assert.equal(doc.getElementById(SANDBOX_ID).childElementCount, 0);
});

test('mermaid: diagrama inválido não chama render e mostra erro com a fonte', async () => {
  const mm = fakeMermaid();
  const root = rootFor(MD('graph TD\n  invalido ->'));
  const r = await renderMermaidBlocks(root, { mermaid: mm, document: doc });
  assert.deepEqual(r, { rendered: 0, failed: 1, aborted: false });
  assert.equal(mm.calls.render, 0, 'render nunca deve receber diagrama inválido');
  const el = root.querySelector('.mermaid');
  assert.ok(el.classList.contains(ERROR_CLASS));
  assert.match(el.querySelector('.mermaid-error-title').textContent, /Parse error on line 2/);
  assert.match(el.querySelector('pre code').textContent, /invalido ->/);
  assert.equal(doc.body.querySelectorAll('[id^="dmmd-"]').length, 0, 'sem resíduo no body');
});

test('mermaid: após erro, o WYSIWYG ainda reconverte o bloco para ```mermaid```', async () => {
  const root = rootFor(MD('graph TD\n  invalido ->'));
  await renderMermaidBlocks(root, { mermaid: fakeMermaid(), document: doc });
  const md = htmlToMarkdown(root);
  assert.match(md, /```mermaid\ngraph TD\n {2}invalido ->\n```/);
});

test('mermaid: um bloco com erro não impede os seguintes', async () => {
  const root = rootFor(MD('invalido') + '\n```mermaid\ngraph LR\n  X --> Y\n```\n');
  const r = await renderMermaidBlocks(root, { mermaid: fakeMermaid(), document: doc });
  assert.equal(r.failed, 1);
  assert.equal(r.rendered, 1);
  assert.equal(root.querySelectorAll('.mermaid svg').length, 1);
});

test('mermaid: render que nunca termina cai no timeout e vira erro', async () => {
  const root = rootFor(MD('graph TD\n  trava'));
  const r = await renderMermaidBlocks(root, { mermaid: fakeMermaid(), document: doc, timeoutMs: 20 });
  assert.equal(r.failed, 1);
  assert.match(root.querySelector('.mermaid-error-title').textContent, /excedeu 20 ms/);
  assert.equal(doc.getElementById(SANDBOX_ID).childElementCount, 0, 'resíduo do render removido');
});

test('mermaid: render que lança algo que não é Error ainda gera mensagem', async () => {
  const mm = fakeMermaid({ throwValue: { str: 'Syntax error in text', hash: {} } });
  const root = rootFor(MD('invalido'));
  await renderMermaidBlocks(root, { mermaid: mm, document: doc });
  assert.match(root.querySelector('.mermaid-error-title').textContent, /Syntax error in text/);
});

test('mermaid: bloco vazio vira aviso, sem chamar o mermaid', async () => {
  const mm = fakeMermaid();
  const root = doc.createElement('div');
  root.innerHTML = '<div class="mermaid" data-src="   ">   </div>';
  const r = await renderMermaidBlocks(root, { mermaid: mm, document: doc });
  assert.equal(r.failed, 1);
  assert.equal(mm.calls.parse + mm.calls.render, 0);
});

test('mermaid: renderização obsoleta é abandonada (troca de aba no meio)', async () => {
  const root = rootFor(MD('a') + '\n```mermaid\nb\n```\n');
  const isStale = () => root.querySelectorAll('.mermaid svg').length >= 1; // fica obsoleta após o 1º bloco
  const r = await renderMermaidBlocks(root, { mermaid: fakeMermaid(), document: doc, isStale });
  assert.equal(r.aborted, true);
  assert.equal(r.rendered, 1);
});

test('mermaid: describeRenderError aceita Error, string, objeto e nulo', () => {
  assert.equal(describeRenderError(new Error('x\ny')), 'x y');
  assert.equal(describeRenderError('Parse error on line 3:\n...A -->\n-----^\nExpecting X'), 'Parse error on line 3: ...A --> Expecting X');
  assert.equal(describeRenderError('só texto'), 'só texto');
  assert.equal(describeRenderError({ str: 'bomba' }), 'bomba');
  assert.equal(describeRenderError(null), 'erro desconhecido');
  assert.ok(describeRenderError('a'.repeat(300)).length <= 200);
});

test('mermaid: cleanupMermaid remove resíduos d<id>/i<id> do body', () => {
  for (const id of ['x1', 'dx1', 'ix1']) { const e = doc.createElement('div'); e.id = id; doc.body.appendChild(e); }
  ensureSandbox(doc).appendChild(doc.createElement('span'));
  cleanupMermaid(doc, 'x1');
  assert.ok(doc.getElementById('x1'), 'o elemento com o id do SVG final não é removido');
  doc.getElementById('x1').remove();
  assert.equal(doc.getElementById('dx1'), null);
  assert.equal(doc.getElementById('ix1'), null);
  assert.equal(doc.getElementById(SANDBOX_ID).childElementCount, 0);
});

test('mermaid: withTimeout resolve antes do limite e rejeita depois', async () => {
  assert.equal(await withTimeout(Promise.resolve(1), 50), 1);
  await assert.rejects(withTimeout(new Promise(() => {}), 10, 'op'), /op excedeu 10 ms/);
});

test('mermaid: o container isolado tem largura real (gantt mede o pai ao desenhar)', async () => {
  const mm = fakeMermaid();
  const root = rootFor(MD('gantt\n  title x'));
  await renderMermaidBlocks(root, { mermaid: mm, document: doc, width: 640 });
  assert.equal(mm.calls.containerWidth, '640px');
  const box = doc.getElementById(SANDBOX_ID);
  assert.doesNotMatch(box.style.cssText, /visibility:\s*hidden|display:\s*none/, 'getBBox precisa de layout');
  // sem largura medível (jsdom não faz layout) cai no padrão
  await renderMermaidBlocks(root, { mermaid: mm, document: doc });
  assert.equal(mm.calls.containerWidth, DEFAULT_WIDTH + 'px');
  assert.equal(usableWidth(null), DEFAULT_WIDTH);
  assert.equal(ensureSandbox(doc, 10).style.width, '200px', 'largura mínima');
});
