// test/rules.test.mjs — regras de digitação (blocos e inline)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockRule, inlineRule } from '../lib/rules.mjs';

test('bloco: "# " a "###### " viram cabeçalho do nível certo', () => {
  assert.deepEqual(blockRule('#', ' '), { kind: 'heading', level: 1 });
  assert.deepEqual(blockRule('###', ' '), { kind: 'heading', level: 3 });
  assert.deepEqual(blockRule('######', ' '), { kind: 'heading', level: 6 });
  assert.equal(blockRule('#######', ' '), null); // 7 não é cabeçalho
});

test('bloco: "#" digitado sem espaço continua literal', () => {
  assert.equal(blockRule('#', 'a'), null);
  assert.equal(blockRule('#', 'Enter'), null);
  assert.equal(blockRule('texto #', ' '), null); // # no meio do texto
});

test('bloco: citação, listas e lista numerada', () => {
  assert.deepEqual(blockRule('>', ' '), { kind: 'quote' });
  assert.deepEqual(blockRule('-', ' '), { kind: 'ul' });
  assert.deepEqual(blockRule('*', ' '), { kind: 'ul' });
  assert.deepEqual(blockRule('1.', ' '), { kind: 'ol' });
  assert.equal(blockRule('2.', ' '), null);
});

test('bloco: ``` + Enter abre bloco de código, com linguagem opcional', () => {
  assert.deepEqual(blockRule('```', 'Enter'), { kind: 'fence', lang: '' });
  assert.deepEqual(blockRule('```mermaid', 'Enter'), { kind: 'fence', lang: 'mermaid' });
  assert.equal(blockRule('``', 'Enter'), null); // ainda não é fence
  assert.equal(blockRule('```', ' '), null);
});

test('bloco: --- + Enter vira linha horizontal', () => {
  assert.deepEqual(blockRule('---', 'Enter'), { kind: 'hr' });
  assert.equal(blockRule('--', 'Enter'), null);
});

test('inline: crase fechada vira código; crase aberta não dispara', () => {
  assert.deepEqual(inlineRule('use `npm test`'), { kind: 'code', full: '`npm test`', inner: 'npm test' });
  assert.equal(inlineRule('use `npm test'), null);
  assert.equal(inlineRule('`'), null);
  assert.equal(inlineRule('``'), null); // vazio não é código
});

test('inline: negrito, itálico e tachado', () => {
  assert.deepEqual(inlineRule('um **forte**'), { kind: 'strong', full: '**forte**', inner: 'forte' });
  assert.deepEqual(inlineRule('um *leve*'), { kind: 'em', full: '*leve*', inner: 'leve' });
  assert.deepEqual(inlineRule('um ~~velho~~'), { kind: 'strike', full: '~~velho~~', inner: 'velho' });
});

test('inline: código tem prioridade sobre negrito dentro dele', () => {
  const r = inlineRule('`a **b**`');
  assert.equal(r.kind, 'code');
  assert.equal(r.inner, 'a **b**');
});

test('inline: asterisco com espaço nas bordas não vira itálico', () => {
  assert.equal(inlineRule('2 * 3 *'), null);
  assert.equal(inlineRule('a * b*'), null);
  assert.equal(inlineRule('- item'), null);
});

test('inline: span com conteúdo vazio ou só espaços não dispara', () => {
  assert.equal(inlineRule('****'), null);
  assert.equal(inlineRule('** **'), null);
});
