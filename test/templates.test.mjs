// test/templates.test.mjs — modelos de diagrama Mermaid do menu
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MERMAID_TEMPLATES, templateGroups, findTemplate } from '../lib/mermaid-templates.mjs';

test('modelos: ids únicos, rótulos e grupos preenchidos', () => {
  const ids = MERMAID_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of MERMAID_TEMPLATES) {
    assert.ok(t.label && t.group, t.id);
    assert.equal(typeof t.source, 'string');
  }
});

test('modelos: "Em branco" é o primeiro e todos os outros têm ao menos quatro elementos', () => {
  assert.equal(MERMAID_TEMPLATES[0].id, 'blank');
  assert.equal(MERMAID_TEMPLATES[0].source, '');
  for (const t of MERMAID_TEMPLATES.slice(1)) {
    const lines = t.source.split('\n').filter((l) => l.trim());
    assert.ok(lines.length >= 5, `${t.id}: cabeçalho + 4 elementos (tem ${lines.length} linhas)`);
    assert.doesNotMatch(t.source, /```/, `${t.id}: sem cercas dentro do modelo`);
  }
});

test('modelos: fluxograma com subgráficos tem ao menos dois subgraph', () => {
  const t = findTemplate('flowchart-subgraphs');
  assert.ok((t.source.match(/^\s*subgraph /gm) || []).length >= 2);
});

test('modelos: cobertura dos tipos principais e agrupamento ordenado', () => {
  for (const id of ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'mindmap', 'timeline', 'gitgraph']) assert.ok(findTemplate(id), id);
  const groups = templateGroups();
  assert.equal(groups[0].group, 'Básico');
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), MERMAID_TEMPLATES.length);
  assert.equal(findTemplate('nao-existe'), null);
});
