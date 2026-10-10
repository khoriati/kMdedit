// test/tabs.test.mjs — abas, zoom e tema (lógica pura)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TabStore, clampZoom, zoomStep, normalizeTheme, normalizeMode, basename,
  ZOOM_MIN, ZOOM_MAX,
} from '../lib/tabs.mjs';

test('abas: nova aba vira ativa e o modo padrao e wysiwyg', () => {
  const s = new TabStore();
  const a = s.create();
  assert.equal(s.active().id, a.id);
  assert.equal(a.mode, 'wysiwyg');
});

test('abas: abrir varias abas na mesma janela mantem todas', () => {
  const s = new TabStore();
  s.create({ path: '/x/a.md' });
  s.create({ path: '/x/b.md' });
  assert.equal(s.tabs.length, 2);
  assert.equal(s.active().path, '/x/b.md');
});

test('abas: proxima e anterior dao a volta na lista', () => {
  const s = new TabStore();
  const a = s.create({ path: 'a.md' });
  const b = s.create({ path: 'b.md' });
  s.activate(a.id);
  assert.equal(s.step(1).id, b.id);
  assert.equal(s.step(1).id, a.id); // volta ao inicio
  assert.equal(s.step(-1).id, b.id); // volta ao fim
});

test('abas: fechar a ativa ativa a vizinha da direita, senao a da esquerda', () => {
  const s = new TabStore();
  const a = s.create({ path: 'a.md' });
  const b = s.create({ path: 'b.md' });
  const c = s.create({ path: 'c.md' });
  s.activate(b.id);
  assert.equal(s.close(b.id).id, c.id);
  assert.equal(s.close(c.id).id, a.id); // era o ultimo: cai na esquerda
  assert.equal(s.close(a.id), null);
  assert.equal(s.activeId, null);
});

test('abas: fechar aba nao ativa nao muda a ativa', () => {
  const s = new TabStore();
  const a = s.create({ path: 'a.md' });
  const b = s.create({ path: 'b.md' });
  s.close(a.id);
  assert.equal(s.active().id, b.id);
});

test('abas: findByPath evita abrir o mesmo arquivo duas vezes', () => {
  const s = new TabStore();
  const a = s.create({ path: '/d/a.md' });
  assert.equal(s.findByPath('/d/a.md').id, a.id);
  assert.equal(s.findByPath('/d/zz.md'), null);
  assert.equal(s.findByPath(null), null);
});

test('abas: anyDirty e titulo com marcador de alteracao', () => {
  const s = new TabStore();
  const a = s.create({ path: '/d/doc.md' });
  assert.equal(s.anyDirty(), false);
  a.dirty = true;
  assert.equal(s.anyDirty(), true);
  assert.equal(s.title(a), 'doc.md •');
  assert.equal(s.title(s.create()), 'Sem título');
});

test('zoom: limita entre minimo e maximo e arredonda', () => {
  assert.equal(clampZoom(10), ZOOM_MAX);
  assert.equal(clampZoom(0), ZOOM_MIN);
  assert.equal(clampZoom(1.234), 1.2);
  assert.equal(clampZoom('abc'), 1);
  assert.equal(clampZoom(undefined), 1);
});

test('zoom: passos de 10% sem acumular erro de ponto flutuante', () => {
  let z = 1;
  for (let i = 0; i < 5; i++) z = zoomStep(z, 1);
  assert.equal(z, 1.5);
  for (let i = 0; i < 20; i++) z = zoomStep(z, -1);
  assert.equal(z, ZOOM_MIN);
});

test('tema e modo: valores invalidos caem no padrao', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('contrast'), 'contrast');
  assert.equal(normalizeTheme('neon'), 'light');
  assert.equal(normalizeMode('source'), 'source');
  assert.equal(normalizeMode('x'), 'wysiwyg');
});

test('basename funciona com / e \\', () => {
  assert.equal(basename('/a/b/c.md'), 'c.md');
  assert.equal(basename('C:\\docs\\c.md'), 'c.md');
});
