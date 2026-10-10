// test/recent.test.mjs — arquivos recentes: limite de 20, únicos, ordem
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRecent, normalizeRecent, removeRecent, MAX_RECENT } from '../lib/recent.mjs';

const files = (n, prefix = 'f') => Array.from({ length: n }, (_, i) => `/d/${prefix}${i}.md`);

test('recentes: limite padrão é 20', () => {
  assert.equal(MAX_RECENT, 20);
});

test('recentes: abrir um arquivo o coloca no topo', () => {
  let l = addRecent([], '/a.md');
  l = addRecent(l, '/b.md');
  assert.deepEqual(l, ['/b.md', '/a.md']);
});

test('recentes: reabrir um arquivo não duplica, apenas sobe ao topo', () => {
  let l = addRecent([], '/a.md');
  l = addRecent(l, '/b.md');
  l = addRecent(l, '/a.md');
  assert.deepEqual(l, ['/a.md', '/b.md']);
});

test('recentes: nunca passa de 20 itens únicos', () => {
  let l = [];
  for (const p of files(35)) l = addRecent(l, p);
  assert.equal(l.length, 20);
  assert.equal(l[0], '/d/f34.md'); // o mais novo
  assert.equal(l[19], '/d/f15.md'); // os 15 mais antigos saíram
  assert.equal(new Set(l).size, 20);
});

test('recentes: 20 itens e reabrir um deles não estoura o limite', () => {
  let l = [];
  for (const p of files(20)) l = addRecent(l, p);
  l = addRecent(l, '/d/f0.md');
  assert.equal(l.length, 20);
  assert.equal(l[0], '/d/f0.md');
  assert.equal(new Set(l).size, 20);
});

test('recentes: normalizeRecent descarta lixo, duplicatas e respeita o limite', () => {
  const dirty = ['/a.md', '/a.md', '', '   ', null, 42, '/b.md', ...files(30, 'x')];
  const out = normalizeRecent(dirty);
  assert.equal(out.length, 20);
  assert.equal(out[0], '/a.md');
  assert.equal(new Set(out).size, out.length);
  assert.ok(out.every((p) => typeof p === 'string' && p.trim()));
});

test('recentes: normalizeRecent aceita entrada que não é lista', () => {
  assert.deepEqual(normalizeRecent(null), []);
  assert.deepEqual(normalizeRecent('/a.md'), []);
});

test('recentes: removeRecent tira o caminho e preserva a ordem', () => {
  assert.deepEqual(removeRecent(['/a.md', '/b.md', '/c.md'], '/b.md'), ['/a.md', '/c.md']);
  assert.deepEqual(removeRecent(['/a.md'], '/zz.md'), ['/a.md']);
});

test('recentes: caminho vazio não entra na lista', () => {
  assert.deepEqual(addRecent(['/a.md'], ''), ['/a.md']);
});
