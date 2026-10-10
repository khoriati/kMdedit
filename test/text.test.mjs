// test/text.test.mjs — utilitários de caminho e texto
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMarkdownPath, normalizeNewlines, basename, extensionOf, defaultModeForPath, looksLikeText } from '../lib/text.mjs';

test('normalizeNewlines: CRLF/CR -> LF, vazio seguro', () => {
  assert.equal(normalizeNewlines('a\r\nb\rc\ndef\n'), 'a\nb\nc\ndef\n');
  assert.equal(normalizeNewlines(''), '');
  assert.equal(normalizeNewlines(null), '');
});

test('isMarkdownPath: valida extensões', () => {
  assert.equal(isMarkdownPath('a.md'), true);
  assert.equal(isMarkdownPath('a.MARKDOWN'), true);
  assert.equal(isMarkdownPath('a.mdx'), true);
  assert.equal(isMarkdownPath('a.txt'), false);
  assert.equal(isMarkdownPath(null), false);
});

test('basename e extensionOf aceitam / e \\', () => {
  assert.equal(basename('/a/b/c.md'), 'c.md');
  assert.equal(basename('C:\\docs\\c.md'), 'c.md');
  assert.equal(extensionOf('/a/b/README.MD'), 'md');
  assert.equal(extensionOf('/a/b/sem-ext'), '');
  assert.equal(extensionOf('/a/.hidden'), '');
});

test('defaultModeForPath: markdown abre em WYSIWYG, outros textos em Código', () => {
  assert.equal(defaultModeForPath('/x/a.md'), 'wysiwyg');
  assert.equal(defaultModeForPath('/x/a.txt'), 'source');
  assert.equal(defaultModeForPath('/x/Makefile'), 'source');
});

test('looksLikeText: rejeita NUL e excesso de bytes de controle', () => {
  assert.equal(looksLikeText('texto normal\n\tcom tab\r\n'), true);
  assert.equal(looksLikeText(''), true);
  assert.equal(looksLikeText('abc\u0000def'), false);
  assert.equal(looksLikeText('\u0001\u0002\u0003\u0004\u0005abc'), false);
});
