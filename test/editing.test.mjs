// test/editing.test.mjs — comportamento de teclas em blocos de código e atalhos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeBlockKey, normalizeCodeText, formatShortcut } from '../lib/editing.mjs';

test('código: Enter dentro do bloco insere quebra de linha, não divide o bloco', () => {
  assert.deepEqual(codeBlockKey({ key: 'Enter', before: 'graph TD', after: '' }), { type: 'newline' });
  assert.deepEqual(codeBlockKey({ key: 'Enter', before: '{\n  "a": 1', after: '\n}' }), { type: 'newline' });
});

test('código: Cmd/Ctrl+Enter sai do bloco; Enter após linha vazia no fim também', () => {
  assert.deepEqual(codeBlockKey({ key: 'Enter', mod: true, before: 'x', after: 'y' }), { type: 'exit' });
  assert.deepEqual(codeBlockKey({ key: 'Enter', before: 'x\n\n', after: '' }), { type: 'exit', trimEmptyLines: true });
  assert.deepEqual(codeBlockKey({ key: 'Enter', before: 'x\n\n', after: 'resto' }), { type: 'newline' });
});

test('código: Tab indenta, Shift+Tab desindenta, Backspace em bloco vazio remove', () => {
  assert.deepEqual(codeBlockKey({ key: 'Tab' }), { type: 'indent' });
  assert.deepEqual(codeBlockKey({ key: 'Tab', shift: true }), { type: 'outdent' });
  assert.deepEqual(codeBlockKey({ key: 'Backspace', before: '', after: '\n' }), { type: 'remove' });
  assert.equal(codeBlockKey({ key: 'Backspace', before: 'a', after: '' }), null);
  assert.equal(codeBlockKey({ key: 'a' }), null);
});

test('código: normalizeCodeText garante exatamente um \\n final', () => {
  assert.equal(normalizeCodeText('a\n\n\n'), 'a\n');
  assert.equal(normalizeCodeText('a'), 'a\n');
  assert.equal(normalizeCodeText(''), '\n');
});

test('atalhos: Cmd+1..6, Cmd+B/I/E/K e Cmd+Alt+U/O/X/Q/C/M estilo Typora', () => {
  const ev = (code, o = {}) => ({ code, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...o });
  assert.equal(formatShortcut(ev('Digit1')), 'h1');
  assert.equal(formatShortcut(ev('Digit6')), 'h6');
  assert.equal(formatShortcut(ev('KeyB')), 'bold');
  assert.equal(formatShortcut(ev('KeyX', { altKey: true })), 'task');
  assert.equal(formatShortcut(ev('KeyC', { altKey: true })), 'codeblock');
  assert.equal(formatShortcut(ev('KeyM', { altKey: true })), 'mermaid');
  assert.equal(formatShortcut({ code: 'KeyU', ctrlKey: true, altKey: true }), 'ul', 'Ctrl no PC');
  assert.equal(formatShortcut(ev('KeyB', { shiftKey: true })), null);
  assert.equal(formatShortcut({ code: 'KeyB' }), null, 'sem modificador não é atalho');
});
