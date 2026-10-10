// test/markdown.test.mjs — testes fundamentais de edição Markdown:
// cada construção sobrevive ao ciclo markdown -> HTML editável -> markdown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from './dom.mjs';
import { renderMarkdown } from '../lib/render.mjs';
import { htmlToMarkdown } from '../lib/convert.mjs';
import { blockRule, inlineRule } from '../lib/rules.mjs';

const { parse, purify, document: doc } = ctx;
const roundtrip = (md) => {
  const html = renderMarkdown(md, { parse, purify, document: doc });
  const box = doc.createElement('div');
  box.innerHTML = html;
  return htmlToMarkdown(box);
};
// Dois ciclos devem ser idênticos: a conversão precisa ser estável.
const stable = (md) => { const a = roundtrip(md); assert.equal(roundtrip(a), a, 'segundo ciclo difere'); return a; };

test('md: títulos de 1 a 6', () => {
  const out = stable('# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6\n');
  for (let i = 1; i <= 6; i++) assert.match(out, new RegExp(`^${'#'.repeat(i)} H${i}$`, 'm'));
});

test('md: ênfases e código inline', () => {
  const out = stable('**negrito** *itálico* ~~tachado~~ `código` ***ambos***\n');
  assert.match(out, /\*\*negrito\*\*/);
  assert.match(out, /\*itálico\*/);
  assert.match(out, /~~tachado~~/);
  assert.match(out, /`código`/);
  assert.match(out, /\*\*\*ambos\*\*\*|\*\*\*ambos\*\*\*|_\*\*ambos\*\*_|\*\*\*ambos\*\*\*/);
});

test('md: listas com marcador, numeradas e aninhadas', () => {
  const out = stable('- a\n- b\n  - b1\n  - b2\n- c\n\n1. um\n2. dois\n3. três\n');
  assert.match(out, /^- a$/m);
  assert.match(out, /^ {2,4}- b1$/m);
  assert.match(out, /^1\. {1,2}um$/m);
  assert.match(out, /^3\. {1,2}três$/m);
});

test('md: lista de tarefas (checkbox) preserva marcado e desmarcado', () => {
  const out = stable('- [ ] pendente\n- [x] feito\n');
  assert.match(out, /^- \[ \] pendente$/m);
  assert.match(out, /^- \[x\] feito$/m);
});

test('md: citação, linha horizontal e parágrafos', () => {
  const out = stable('> uma citação\n> com duas linhas\n\n---\n\nparágrafo 1\n\nparágrafo 2\n');
  assert.match(out, /^> uma citação/m);
  assert.match(out, /^(---|\* \* \*|___)$/m);
  assert.match(out, /parágrafo 1\n\nparágrafo 2/);
});

test('md: bloco de código com linguagem mantém conteúdo literal (inclusive markdown dentro)', () => {
  const src = '```json\n{\n  "a": 1,\n  "lista": ["**x**", "# y"]\n}\n```\n';
  const out = stable(src);
  assert.equal(out, src);
});

test('md: bloco de código sem linguagem e com várias linhas vazias no meio', () => {
  const src = '```\nlinha 1\n\n\nlinha 4\n```\n';
  assert.equal(stable(src), src);
});

test('md: mermaid preserva indentação e setas', () => {
  const src = '```mermaid\nflowchart LR\n  A --> B\n  B -. x .-> C\n```\n';
  assert.equal(stable(src), src);
});

test('md: links, imagens e autolinks', () => {
  const out = stable('[texto](https://ex.com/a?b=1 "título") ![alt](img.png) <https://ex.com>\n');
  assert.match(out, /\[texto\]\(https:\/\/ex\.com\/a\?b=1 "título"\)/);
  assert.match(out, /!\[alt\]\(img\.png\)/);
  assert.match(out, /https:\/\/ex\.com/);
});

test('md: tabela GFM com alinhamento', () => {
  const out = stable('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
  assert.match(out, /\| a \| b \|/);
  assert.match(out, /\| 1 \| 2 \|/);
});

test('md: caracteres especiais não viram formatação', () => {
  const out = stable('preço 2 * 3 = 6 e 4_5_6 e a\\*b\n');
  assert.match(out, /2 \\?\* 3/);
  assert.match(out, /4\\?_5\\?_6/);
});

test('md: regras de digitação cobrem título, lista, tarefa, citação, código e hr', () => {
  assert.deepEqual(blockRule('##', ' '), { kind: 'heading', level: 2 });
  assert.deepEqual(blockRule('-', ' '), { kind: 'ul' });
  assert.deepEqual(blockRule('- [ ]', ' '), { kind: 'task', checked: false });
  assert.deepEqual(blockRule('- [x]', ' '), { kind: 'task', checked: true });
  assert.deepEqual(blockRule('* [X]', ' '), { kind: 'task', checked: true });
  assert.deepEqual(blockRule('[ ]', ' ', { inList: true }), { kind: 'task', checked: false }, 'dentro de item de lista');
  assert.equal(blockRule('[ ]', ' '), null, 'fora de lista precisa do marcador');
  assert.equal(blockRule('- [ ]', 'Enter'), null);
  assert.deepEqual(blockRule('1.', ' '), { kind: 'ol' });
  assert.deepEqual(blockRule('>', ' '), { kind: 'quote' });
  assert.deepEqual(blockRule('```json', 'Enter'), { kind: 'fence', lang: 'json' });
  assert.deepEqual(blockRule('---', 'Enter'), { kind: 'hr' });
  assert.deepEqual(inlineRule('a **b**'), { kind: 'strong', full: '**b**', inner: 'b' });
});
