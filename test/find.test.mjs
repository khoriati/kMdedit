// test/find.test.mjs — busca em texto e mapeamento para o DOM
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doc } from './dom.mjs';
import { findMatches, nearestIndex, cycleIndex, collectText, matchToRange } from '../lib/find.mjs';

test('find: ocorrências sem distinção de caixa, sem sobreposição', () => {
  assert.deepEqual(findMatches('Abc abc ABC', 'abc'), [{ start: 0, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 }]);
  assert.deepEqual(findMatches('aaaa', 'aa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.deepEqual(findMatches('x', ''), []);
  assert.deepEqual(findMatches('Abc', 'abc', { caseSensitive: true }), []);
});

test('find: navegação circular e match mais próximo do cursor', () => {
  const m = findMatches('a b a b a', 'a');
  assert.equal(nearestIndex(m, 3), 1);
  assert.equal(nearestIndex(m, 99), 0);
  assert.equal(cycleIndex(2, 3, 1), 0);
  assert.equal(cycleIndex(0, 3, -1), 2);
  assert.equal(cycleIndex(0, 0, 1), -1);
});

test('find: collectText concatena nós de texto e ignora subárvores marcadas', () => {
  const root = doc.createElement('div');
  root.innerHTML = '<p>Olá <b>mundo</b></p><div class="mermaid"><svg><text>graph</text></svg></div><p>fim</p>';
  const idx = collectText(root, { skip: (n) => n.classList && n.classList.contains('mermaid') });
  assert.equal(idx.text, 'Olá mundofim');
  assert.equal(idx.nodes.length, 3);
});

test('find: matchToRange aponta para os nós certos, inclusive atravessando elementos', () => {
  const root = doc.createElement('div');
  root.innerHTML = '<p>Olá <b>mundo</b> cruel</p>';
  const idx = collectText(root);
  const [m] = findMatches(idx.text, 'á mun');
  const r = matchToRange(idx, m);
  assert.equal(r.startNode.nodeValue, 'Olá ');
  assert.equal(r.startOffset, 2);
  assert.equal(r.endNode.nodeValue, 'mundo');
  assert.equal(r.endOffset, 3);
  // match que termina exatamente no fim de um nó fica nesse nó, não no início do seguinte
  const [m2] = findMatches(idx.text, 'mundo');
  const r2 = matchToRange(idx, m2);
  assert.equal(r2.endNode.nodeValue, 'mundo');
  assert.equal(r2.endOffset, 5);
});
