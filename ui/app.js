// ui/app.js — frontend do kMdedit (Tauri). Lógica pura fica em lib/*.mjs.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { renderMarkdown } from '../lib/render.mjs';
import { renderMermaidBlocks, ensureSandbox } from '../lib/mermaid.mjs';
import { htmlToMarkdown } from '../lib/convert.mjs';
import { basename, defaultModeForPath, isMarkdownPath, normalizeNewlines, looksLikeText, TEXT_EXTENSIONS } from '../lib/text.mjs';
import { TabStore, clampZoom, zoomStep, normalizeTheme, ZOOM_DEFAULT } from '../lib/tabs.mjs';
import { blockRule, inlineRule } from '../lib/rules.mjs';
import { codeBlockKey, formatShortcut } from '../lib/editing.mjs';
import { findMatches, nearestIndex, cycleIndex, collectText, matchToRange } from '../lib/find.mjs';
import { templateGroups, findTemplate } from '../lib/mermaid-templates.mjs';
import { addRecent, normalizeRecent, removeRecent } from '../lib/recent.mjs';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save, ask } from '@tauri-apps/plugin-dialog';

const $ = (id) => document.getElementById(id);
const source = $('source');
const sourceWrap = $('source-wrap');
const sourceBackdrop = $('source-backdrop');
const preview = $('preview');
const tabbar = $('tabbar');
const status = $('status');
const modeSwitch = $('mode-switch');
const zoomLabel = $('zoom-label');
const fmtbar = $('fmtbar');
const recentSel = $('recent');
const dropOverlay = $('drop-overlay');
const linkDialog = $('link-dialog');
const findbar = $('findbar');
const mermaidMenu = $('mermaid-menu');
const findInput = $('find-input');
const findCount = $('find-count');

const tabs = new TabStore();
const prefs = { theme: 'light', zoom: ZOOM_DEFAULT };
const MERMAID_THEME = { light: 'default', dark: 'dark', contrast: 'neutral' };
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const parse = (md) => marked.parse(md, { async: false });

// ---------- status e proteção global contra falhas ----------
let statusTimer = null;
function setStatus(msg, { error = false, ttl = error ? 8000 : 4000 } = {}) {
  status.textContent = msg;
  status.classList.toggle('error', error);
  status.title = msg;
  clearTimeout(statusTimer);
  if (msg && ttl) statusTimer = setTimeout(() => { if (status.textContent === msg) { status.textContent = ''; status.classList.remove('error'); } }, ttl);
}
function reportError(context, err) {
  const msg = err && err.message ? err.message : String(err);
  console.error(`[kmdedit] ${context}:`, err);
  setStatus(`${context}: ${msg}`, { error: true });
}
// Nada que escape de um handler pode derrubar a interface: registra e segue.
window.addEventListener('error', (e) => { reportError('erro inesperado', e.error ?? e.message); });
window.addEventListener('unhandledrejection', (e) => { e.preventDefault(); reportError('erro inesperado', e.reason); });

// Dicas dos botões: no Windows/Linux troca os símbolos do macOS por nomes de tecla.
function localizeHints() {
  if (IS_MAC) return;
  for (const el of document.querySelectorAll('[data-hint]')) {
    el.dataset.hint = el.dataset.hint.replace(/⌘⌥/g, 'Ctrl+Alt+').replace(/⌘⇧/g, 'Ctrl+Shift+').replace(/⌘/g, 'Ctrl+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+');
  }
}

// ---------- preferências (tema e zoom) ----------
function initMermaid() {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: MERMAID_THEME[prefs.theme] ?? 'default',
    logLevel: 'fatal',
  });
  mermaid.parseError = () => {};
}
function applyTheme(theme, { rerender = true } = {}) {
  const changed = prefs.theme !== normalizeTheme(theme);
  prefs.theme = normalizeTheme(theme);
  document.body.dataset.theme = prefs.theme;
  try { localStorage.setItem('kmdedit.theme', prefs.theme); } catch { /* sem storage */ }
  initMermaid();
  // Só o modo Visualizar é redesenhado: no WYSIWYG isso perderia o cursor.
  const t = tabs.active();
  if (changed && rerender && t && t.mode === 'render') renderPreview();
}
function applyZoom(z) {
  prefs.zoom = clampZoom(z);
  document.documentElement.style.setProperty('--zoom', String(prefs.zoom));
  zoomLabel.textContent = Math.round(prefs.zoom * 100) + '%';
  try { localStorage.setItem('kmdedit.zoom', String(prefs.zoom)); } catch { /* sem storage */ }
}
function loadPrefs() {
  let theme = 'light';
  let zoom = ZOOM_DEFAULT;
  try {
    theme = localStorage.getItem('kmdedit.theme') || theme;
    zoom = Number(localStorage.getItem('kmdedit.zoom')) || zoom;
  } catch { /* sem storage */ }
  applyTheme(theme, { rerender: false });
  applyZoom(zoom);
}

// ---------- abas ----------
function renderTabs() {
  tabbar.innerHTML = '';
  for (const t of tabs.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === tabs.activeId ? ' active' : '');
    el.setAttribute('role', 'tab');
    el.title = t.path || 'Sem título';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = tabs.title(t);
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.title = 'Fechar aba';
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });
    el.append(name, close);
    el.addEventListener('click', () => switchTo(t.id));
    tabbar.appendChild(el);
  }
  const plus = document.createElement('button');
  plus.className = 'tab-new';
  plus.textContent = '+';
  plus.title = 'Nova aba';
  plus.addEventListener('click', newTab);
  tabbar.appendChild(plus);
  document.title = tabs.active() ? 'kMdedit — ' + tabs.title(tabs.active()) : 'kMdedit';
}

// Salva o estado de edição da aba atual antes de trocar.
function captureCurrent() {
  const t = tabs.active();
  if (!t) return;
  try {
    if (t.mode === 'wysiwyg') {
      // Mesmo com diagramas ainda sendo desenhados o DOM já é conversível:
      // cada bloco mermaid guarda a fonte em data-src.
      const md = htmlToMarkdown(preview);
      if (md !== t.text) { t.text = md; t.dirty = true; }
    } else if (t.mode === 'source') {
      if (source.value !== t.text) { t.text = source.value; t.dirty = true; }
    }
  } catch (err) {
    reportError('falha ao converter o conteúdo editado', err);
  }
}

function showActive() {
  const t = tabs.active();
  if (!t) { source.value = ''; preview.innerHTML = ''; renderTabs(); return; }
  source.value = t.text;
  setMode(t.mode, { keepTab: true });
  renderTabs();
}

function switchTo(id) {
  if (id === tabs.activeId) return;
  captureCurrent();
  tabs.activate(id);
  showActive();
}

function newTab() {
  captureCurrent();
  tabs.create({ text: '', mode: 'wysiwyg' });
  showActive();
  setStatus('nova aba');
}

async function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  if (id === tabs.activeId) captureCurrent();
  if (t.dirty) {
    const ok = await ask(`"${tabs.title(t).replace(' •', '')}" tem alterações não salvas. Fechar mesmo assim?`, { title: 'kMdedit', kind: 'warning' });
    if (!ok) return;
  }
  const wasActive = id === tabs.activeId;
  tabs.close(id);
  if (!tabs.tabs.length) tabs.create({ text: '', mode: 'wysiwyg' });
  if (wasActive) showActive(); else renderTabs();
}

// ---------- renderização ----------
// Cada chamada recebe um número de geração; renders antigos que ainda estejam
// desenhando diagramas são abandonados quando uma geração mais nova começa.
let renderGen = 0;

async function renderPreview() {
  const gen = ++renderGen;
  const isStale = () => gen !== renderGen;
  try {
    let html;
    try {
      html = renderMarkdown(source.value, { parse, purify: DOMPurify, document });
    } catch (err) {
      reportError('falha ao renderizar', err);
      const pre = document.createElement('pre');
      pre.textContent = source.value;
      html = pre.outerHTML;
    }
    if (isStale()) return;
    editingDiagram = null;
    preview.innerHTML = html;
    decoratePreview();
    const r = await renderMermaidBlocks(preview, { mermaid, document, isStale });
    if (isStale()) return;
    if (r.failed) setStatus(`${r.failed} diagrama(s) Mermaid com erro`, { error: true });
    if (!findbar.hidden) runFind({ keepIndex: true });
  } catch (err) {
    if (!isStale()) reportError('falha ao renderizar', err);
  }
}

// Ajustes pós-render: rótulo de linguagem nos blocos de código e checklists
// clicáveis no WYSIWYG (o marked as gera desabilitadas).
function decoratePreview() {
  const editable = tabs.active() && tabs.active().mode === 'wysiwyg';
  // Documento vazio precisa de um parágrafo para as regras de digitação terem um bloco.
  if (editable && !preview.firstElementChild) { preview.innerHTML = ''; preview.appendChild(emptyParagraph()); }
  for (const code of preview.querySelectorAll('pre > code')) {
    const m = /language-([\w+-]+)/.exec(code.className);
    if (m) code.parentElement.dataset.lang = m[1];
    // Sentinela: um '\n' final permite posicionar o cursor na última linha.
    if (editable && !code.textContent.endsWith('\n')) code.appendChild(document.createTextNode('\n'));
  }
  for (const box of preview.querySelectorAll('li > input[type="checkbox"]')) {
    const li = box.parentElement;
    li.classList.add('task');
    li.classList.toggle('done', box.checked);
    box.disabled = !editable;
  }
}
preview.addEventListener('change', (e) => {
  const box = e.target;
  if (box.matches && box.matches('li.task > input[type="checkbox"]')) {
    box.toggleAttribute('checked', box.checked);
    box.parentElement.classList.toggle('done', box.checked);
    markDirty();
  }
});

// ---------- diagramas: clicar para editar como código (estilo Typora) ----------
// No WYSIWYG, clicar em um diagrama renderizado troca o <div class="mermaid">
// por <pre><code class="language-mermaid">; ao mover o cursor para fora, o
// bloco volta a ser desenhado.
let editingDiagram = null;

function openDiagramForEdit(div) {
  const src = (div.getAttribute('data-src') ?? '').replace(/\n+$/, '');
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-mermaid';
  pre.dataset.lang = 'mermaid';
  code.textContent = src + '\n';
  pre.appendChild(code);
  div.replaceWith(pre);
  editingDiagram = pre;
  preview.focus();
  placeCaretAtOffset(code, src.length);
}

async function closeDiagramEdit(pre) {
  if (editingDiagram === pre) editingDiagram = null;
  if (!pre.isConnected) return;
  const code = pre.querySelector('code') || pre;
  const src = code.textContent.replace(/\n+$/, '');
  const div = document.createElement('div');
  div.className = 'mermaid';
  div.setAttribute('data-mermaid', '1');
  div.setAttribute('data-src', src);
  div.textContent = src;
  pre.replaceWith(div);
  if (!src.trim()) { div.remove(); return; }
  await renderMermaidBlocks(div.parentElement || preview, { mermaid, document, isStale: () => !div.isConnected });
}

preview.addEventListener('click', (e) => {
  if (preview.contentEditable !== 'true') return;
  const div = e.target.closest('.mermaid');
  if (div && preview.contains(div)) { e.preventDefault(); openDiagramForEdit(div); }
});
document.addEventListener('selectionchange', () => {
  if (!editingDiagram) return;
  const sel = window.getSelection();
  const inside = sel && sel.rangeCount && editingDiagram.contains(sel.anchorNode);
  if (!inside && document.activeElement === preview) closeDiagramEdit(editingDiagram);
});
preview.addEventListener('blur', () => { if (editingDiagram && !linkDialog.open) closeDiagramEdit(editingDiagram); });

// ---------- formatação e digitação estilo Typora (WYSIWYG) ----------
// Os comandos usam execCommand, que o WebKit do Tauri ainda aceita.
const exec = (cmd, val = null) => { preview.focus(); document.execCommand(cmd, false, val); markDirty(); };
function markDirty() { const t = tabs.active(); if (t && !t.dirty) { t.dirty = true; renderTabs(); } }

function selection() {
  const sel = window.getSelection();
  return sel && sel.rangeCount && preview.contains(sel.anchorNode) ? sel : null;
}

// Bloco (parágrafo/cabeçalho/item/pre) que contém o cursor.
function currentBlock() {
  const sel = selection();
  if (!sel) return null;
  let n = sel.anchorNode;
  while (n && n !== preview && !(n.nodeType === 1 && /^(P|H[1-6]|LI|BLOCKQUOTE|DIV|PRE)$/.test(n.nodeName))) n = n.parentNode;
  if (!n || n === preview) return null;
  // Diagramas e blocos de erro não são editáveis.
  if (n.closest('.mermaid, .render-error')) return null;
  return n;
}

// Elemento <pre> que contém o cursor, se houver.
function currentPre() {
  const sel = selection();
  if (!sel) return null;
  const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  return el && el.closest('pre');
}

// Texto do bloco antes e depois do cursor.
function splitAtCaret(block) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(block);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  const before = r.toString();
  return { before, after: block.textContent.slice(before.length) };
}
const textBeforeCaret = (block) => splitAtCaret(block).before;

// Apaga exatamente os caracteres digitados do marcador (ex.: "###").
function consumeBlockText(len) {
  for (let i = 0; i < len; i++) document.execCommand('delete');
}

function placeCaret(node, offset) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
}

function emptyParagraph() {
  const p = document.createElement('p');
  p.appendChild(document.createElement('br'));
  return p;
}

// Texto digitado direto na raiz do editor (sem bloco) é envolvido em <p>,
// para que as regras de digitação e a conversão tenham um bloco de verdade.
function ensureBlockAtCaret() {
  const sel = selection();
  if (!sel) return;
  const n = sel.anchorNode;
  const el = n.nodeType === 1 ? n : n.parentElement;
  if (el === preview || (el && el.parentElement === preview && !/^(P|H[1-6]|LI|UL|OL|BLOCKQUOTE|DIV|PRE|TABLE|HR)$/.test(el.nodeName))) {
    document.execCommand('formatBlock', false, 'p');
  }
}

function newParagraphAfter(el) {
  const p = emptyParagraph();
  el.after(p);
  placeCaret(p, 0);
  markDirty();
  return p;
}

function insertCodeBlock(lang = '', initial = '') {
  const sel = selection();
  if (!sel) { preview.focus(); }
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  if (lang) { code.className = 'language-' + lang; pre.dataset.lang = lang; }
  code.textContent = initial + '\n';
  pre.appendChild(code);
  const block = currentBlock();
  if (block && block !== preview && block.nodeName !== 'LI' && !block.textContent.trim()) {
    block.replaceWith(pre); // parágrafo vazio vira o bloco
  } else if (block) {
    block.after(pre);
  } else {
    preview.appendChild(pre);
  }
  placeCaretAtOffset(code, initial.length);
  // Um bloco mermaid novo é desenhado assim que o cursor sai dele.
  if (lang === 'mermaid') editingDiagram = pre;
  markDirty();
}

// ---------- menu de modelos Mermaid ----------
function buildMermaidMenu() {
  mermaidMenu.innerHTML = '';
  for (const g of templateGroups()) {
    const head = document.createElement('div');
    head.className = 'menu-group';
    head.textContent = g.group;
    mermaidMenu.appendChild(head);
    for (const t of g.items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.dataset.template = t.id;
      b.textContent = t.label;
      if (t.source) {
        const hint = document.createElement('small');
        hint.textContent = t.source.split('\n')[0];
        b.appendChild(hint);
      }
      mermaidMenu.appendChild(b);
    }
  }
}
function openMermaidMenu(anchor) {
  if (!mermaidMenu.childElementCount) buildMermaidMenu();
  const r = (anchor || fmtbar.querySelector('[data-fmt="mermaid"]')).getBoundingClientRect();
  mermaidMenu.hidden = false;
  mermaidMenu.style.left = Math.min(r.left, window.innerWidth - mermaidMenu.offsetWidth - 8) + 'px';
  mermaidMenu.style.top = (r.bottom + 4) + 'px';
  fmtbar.querySelector('[data-fmt="mermaid"]').setAttribute('aria-expanded', 'true');
  const first = mermaidMenu.querySelector('[role="menuitem"]');
  if (first) first.focus();
}
function closeMermaidMenu({ refocus = true } = {}) {
  if (mermaidMenu.hidden) return;
  mermaidMenu.hidden = true;
  fmtbar.querySelector('[data-fmt="mermaid"]').setAttribute('aria-expanded', 'false');
  if (refocus) preview.focus();
}
function pickMermaidTemplate(id) {
  const t = findTemplate(id);
  closeMermaidMenu();
  if (!t) return;
  insertCodeBlock('mermaid', t.source);
}
mermaidMenu.addEventListener('mousedown', (e) => e.preventDefault()); // mantém a seleção do editor
mermaidMenu.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-template]');
  if (b) pickMermaidTemplate(b.dataset.template);
});
mermaidMenu.addEventListener('keydown', (e) => {
  const items = [...mermaidMenu.querySelectorAll('[role="menuitem"]')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeMermaidMenu(); }
  else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); pickMermaidTemplate(items[i].dataset.template); }
});
document.addEventListener('mousedown', (e) => {
  if (!mermaidMenu.hidden && !mermaidMenu.contains(e.target) && !e.target.closest('[data-fmt="mermaid"]')) closeMermaidMenu({ refocus: false });
});

// Teclas dentro de um bloco de código: o WebKit dividiria o <pre> em dois ao
// dar Enter (parecendo "abrir outro bloco"); aqui o Enter vira '\n' no código.
function handleCodeKey(e, pre) {
  const code = pre.querySelector('code') || pre;
  const { before, after } = splitAtCaret(code);
  const action = codeBlockKey({ key: e.key, mod: e.metaKey || e.ctrlKey, shift: e.shiftKey, before, after });
  if (!action) return false;
  if (action.type === 'exit-if-last') {
    if (pre.nextElementSibling) return false;
    e.preventDefault(); newParagraphAfter(pre); return true;
  }
  e.preventDefault();
  if (action.type === 'newline') insertCodeText('\n', code);
  else if (action.type === 'indent') insertCodeText('  ', code);
  else if (action.type === 'outdent') {
    const m = /(?:^|\n)( {1,2})$/.exec(before);
    if (m) consumeBlockText(m[1].length);
  } else if (action.type === 'remove') {
    const p = newParagraphAfter(pre); pre.remove(); placeCaret(p, 0);
  } else if (action.type === 'exit') {
    if (action.trimEmptyLines) code.textContent = code.textContent.replace(/\n+$/, '\n');
    newParagraphAfter(pre);
  }
  return true;
}

// Insere texto literal no código mantendo o '\n' sentinela no fim.
function insertCodeText(text, code) {
  const sel = window.getSelection();
  const r = sel.getRangeAt(0);
  const head = document.createRange();
  head.selectNodeContents(code);
  head.setEnd(r.startContainer, r.startOffset);
  const offset = head.toString().length + text.length;
  r.deleteContents();
  r.insertNode(document.createTextNode(text));
  // O cursor nunca pode ficar depois do último '\n': nessa posição o WebKit
  // descarta a quebra ao digitar. Garante um '\n' sentinela além do cursor.
  if (!code.textContent.endsWith('\n') || offset >= code.textContent.length) code.appendChild(document.createTextNode('\n'));
  code.normalize();
  placeCaretAtOffset(code, Math.min(offset, code.textContent.length));
  markDirty();
}

function placeCaretAtOffset(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; let acc = 0;
  while ((n = walker.nextNode())) {
    const len = n.nodeValue.length;
    if (acc + len >= offset) { placeCaret(n, offset - acc); return; }
    acc += len;
  }
  placeCaret(root, root.childNodes.length);
}

// Listas via execCommand. O WebKit às vezes deixa a lista dentro do <p>
// vazio de origem (<p><ul>…); aqui ela é desaninhada.
function insertList(cmd) {
  exec(cmd);
  const li = currentBlock();
  const list = li && li.nodeName === 'LI' ? li.parentElement : null;
  if (list && list.parentElement && list.parentElement.nodeName === 'P' && list.parentElement.parentElement) {
    // Mover a lista invalida a seleção: guarda o offset do cursor e restaura.
    const offset = splitAtCaret(li).before.length;
    list.parentElement.replaceWith(list);
    placeCaretAtOffset(li, offset);
  }
  return currentBlock();
}

// Lista de tarefas: lista com checkbox no item atual.
function makeTask(checked = false) {
  let li = currentBlock();
  if (!li || li.nodeName !== 'LI') li = insertList('insertUnorderedList');
  if (!li || li.nodeName !== 'LI') { setStatus('coloque o cursor em um parágrafo para criar a tarefa', { error: true }); return; }
  if (li.querySelector(':scope > input[type="checkbox"]')) {
    li.querySelector(':scope > input[type="checkbox"]').remove();
    li.classList.remove('task', 'done');
  } else {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    if (checked) box.setAttribute('checked', '');
    li.prepend(box, document.createTextNode(' '));
    li.classList.add('task');
    li.classList.toggle('done', checked);
    placeCaret(li, li.childNodes.length);
  }
  markDirty();
}

// Regras de digitação: "# " vira título, "```" + Enter vira bloco de código,
// "- [ ] " vira tarefa etc. Dentro de <pre>, as teclas vão para handleCodeKey.
preview.addEventListener('keydown', (e) => {
  if (preview.contentEditable !== 'true') return;
  const pre = currentPre();
  if (pre) { handleCodeKey(e, pre); return; }
  if (e.key !== ' ' && e.key !== 'Enter') return;
  ensureBlockAtCaret();
  const block = currentBlock();
  if (!block) return;
  // Enter em item de tarefa vazio encerra a lista (a caixa de seleção impede o
  // comportamento padrão do navegador).
  if (e.key === 'Enter' && block.nodeName === 'LI' && block.classList.contains('task') && !block.textContent.trim()) {
    e.preventDefault();
    const list = block.parentElement;
    block.remove();
    if (!list.querySelector('li')) { const p = emptyParagraph(); list.replaceWith(p); placeCaret(p, 0); }
    else newParagraphAfter(list);
    return;
  }
  const before = textBeforeCaret(block);
  const rule = blockRule(before, e.key === ' ' ? ' ' : 'Enter', { inList: block.nodeName === 'LI' });
  if (!rule) return;
  e.preventDefault();
  consumeBlockText(before.length);
  if (rule.kind === 'heading') exec('formatBlock', 'H' + rule.level);
  else if (rule.kind === 'quote') exec('formatBlock', 'BLOCKQUOTE');
  else if (rule.kind === 'ul') insertList('insertUnorderedList');
  else if (rule.kind === 'ol') insertList('insertOrderedList');
  else if (rule.kind === 'task') makeTask(rule.checked);
  else if (rule.kind === 'fence') insertCodeBlock(rule.lang);
  else if (rule.kind === 'hr') exec('insertHorizontalRule');
});

// Enter em um item de tarefa continua a lista de tarefas (o WebKit clona a
// classe do <li>, mas não a caixa de seleção).
preview.addEventListener('input', (e) => {
  if (e.inputType !== 'insertParagraph') return;
  const li = currentBlock();
  if (li && li.nodeName === 'LI' && li.classList.contains('task') && !li.querySelector(':scope > input[type="checkbox"]')) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    li.classList.remove('done');
    li.prepend(box, document.createTextNode(' '));
    placeCaret(li, li.childNodes.length);
  }
});

// Regras inline: "`código`", "**negrito**", "*itálico*", "~~tachado~~" ao fechar o span.
preview.addEventListener('input', (e) => {
  if (e.inputType !== 'insertText' || !/[`*~]/.test(e.data || '')) return;
  ensureBlockAtCaret();
  const block = currentBlock();
  if (!block || block.nodeName === 'PRE' || currentPre()) return;
  const anchor = window.getSelection().anchorNode;
  if (anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement).closest('code')) return;
  const before = textBeforeCaret(block);
  const rule = inlineRule(before);
  if (!rule) return;
  // Remove o markdown fechado e insere o elemento formatado como nó (não via
  // insertHTML, que o WebKit reescreve como <span style>), deixando o cursor
  // fora dele para o formato não vazar para o texto seguinte.
  consumeBlockText(rule.full.length);
  const tag = { code: 'code', strong: 'strong', em: 'em', strike: 's' }[rule.kind];
  insertInline(tag, rule.inner);
});

// Insere <tag>text</tag> no cursor e posiciona o cursor logo depois, atrás de
// um separador de largura zero (removido na conversão para Markdown).
function insertInline(tag, text) {
  const sel = selection();
  if (!sel) return;
  const r = sel.getRangeAt(0);
  r.deleteContents();
  const el = document.createElement(tag);
  el.textContent = text;
  const zw = document.createTextNode('\u200B');
  r.insertNode(zw);
  r.insertNode(el);
  placeCaret(zw, 1);
  markDirty();
}


// Diálogo próprio para URL: window.prompt não funciona no WebView do Tauri.
function askLink() {
  const sel = window.getSelection();
  const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const input = $('link-url');
  input.value = '';
  linkDialog.returnValue = 'cancel';
  linkDialog.showModal();
  input.focus();
  linkDialog.addEventListener('close', () => {
    const url = input.value.trim();
    if (saved) { sel.removeAllRanges(); sel.addRange(saved); }
    if (linkDialog.returnValue === 'ok' && url) exec('createLink', url);
    else preview.focus();
  }, { once: true });
}
linkDialog.querySelector('[data-act="cancel"]').addEventListener('click', () => linkDialog.close('cancel'));

// Ações de formatação (barra, atalhos e menu).
const FMT = {
  h1: () => exec('formatBlock', 'H1'),
  h2: () => exec('formatBlock', 'H2'),
  h3: () => exec('formatBlock', 'H3'),
  h4: () => exec('formatBlock', 'H4'),
  h5: () => exec('formatBlock', 'H5'),
  h6: () => exec('formatBlock', 'H6'),
  paragraph: () => exec('formatBlock', 'P'),
  bold: () => exec('bold'),
  italic: () => exec('italic'),
  strike: () => exec('strikeThrough'),
  code: () => wrapSelection('code'),
  ul: () => insertList('insertUnorderedList'),
  ol: () => insertList('insertOrderedList'),
  task: () => makeTask(false),
  quote: () => exec('formatBlock', 'BLOCKQUOTE'),
  codeblock: () => insertCodeBlock(''),
  mermaid: () => (mermaidMenu.hidden ? openMermaidMenu() : closeMermaidMenu()),
  hr: () => exec('insertHorizontalRule'),
  link: askLink,
};

function wrapSelection(tag) {
  const sel = selection();
  const text = sel && sel.toString();
  if (!text) return;
  preview.focus();
  insertInline(tag, text);
}

fmtbar.addEventListener('mousedown', (e) => e.preventDefault()); // não rouba a seleção do editor
fmtbar.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-fmt]');
  if (b && FMT[b.dataset.fmt]) FMT[b.dataset.fmt]();
});

// setMode troca a visualização da aba ativa. Dados são convertidos ao sair do WYSIWYG.
function setMode(mode, { keepTab = false } = {}) {
  const t = tabs.active();
  const from = t ? t.mode : mode;
  if (from === 'wysiwyg' && mode !== 'wysiwyg' && t && !keepTab) {
    captureCurrent();
    source.value = t.text;
  }
  if (t) t.mode = mode;
  closeMermaidMenu({ refocus: false });
  preview.contentEditable = mode === 'wysiwyg' ? 'true' : 'false';
  if (mode === 'source') {
    renderGen++; // cancela diagramas pendentes
    preview.hidden = true; sourceWrap.hidden = false; source.focus();
    if (!findbar.hidden) runFind({ keepIndex: true });
  } else {
    sourceWrap.hidden = true; preview.hidden = false;
    renderPreview().then(() => { if (mode === 'wysiwyg' && tabs.active() === t && findbar.hidden) preview.focus(); });
  }
  for (const b of modeSwitch.querySelectorAll('button[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  fmtbar.hidden = mode !== 'wysiwyg';
  renderTabs();
}
modeSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) setMode(b.dataset.mode);
});

// Ciclo Cmd/Ctrl+Shift+R: WYSIWYG -> Código -> Visualizar -> WYSIWYG.
function cycleMode() {
  const cur = tabs.active() ? tabs.active().mode : 'wysiwyg';
  const next = { wysiwyg: 'source', source: 'render', render: 'wysiwyg' };
  setMode(next[cur]);
}

// ---------- busca (Cmd/Ctrl+F) ----------
// No modo Código a ocorrência atual é selecionada no textarea. Nos outros
// modos usa a CSS Custom Highlight API (sem alterar o DOM editável); se não
// houver suporte, seleciona a ocorrência.
const find = { matches: [], index: -1, ranges: [] };
const hasHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

function openFind() {
  findbar.hidden = false;
  const sel = window.getSelection();
  const seed = (tabs.active() && tabs.active().mode === 'source')
    ? source.value.slice(source.selectionStart, source.selectionEnd)
    : (sel ? sel.toString() : '');
  if (seed && !seed.includes('\n') && seed.length < 200) findInput.value = seed;
  findInput.focus(); findInput.select();
  runFind();
}
function closeFind() {
  findbar.hidden = true;
  clearFindMarks();
  find.matches = []; find.index = -1;
  const t = tabs.active();
  if (t && t.mode === 'source') source.focus(); else if (t && t.mode === 'wysiwyg') preview.focus();
}
function clearFindMarks() {
  if (hasHighlights) { CSS.highlights.delete('find-all'); CSS.highlights.delete('find-current'); }
  // Fallback sem Highlight API: desembrulha as marcas inseridas no DOM.
  for (const m of preview.querySelectorAll('mark.find-mark')) { m.replaceWith(...m.childNodes); }
  if (!hasHighlights) preview.normalize();
  sourceBackdrop.textContent = '';
  find.ranges = [];
}
// Marca ocorrências sem a Highlight API: só ranges dentro de um único nó de texto.
function markRangesFallback() {
  for (const range of find.ranges) {
    if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== 3) continue;
    const m = document.createElement('mark');
    m.className = 'find-mark';
    try { range.surroundContents(m); } catch { /* range inválido: ignora */ }
  }
}
// Modo Código: espelho do textarea com as marcas (a seleção do textarea não
// aparece enquanto o foco está na caixa de busca).
function renderSourceBackdrop() {
  const text = source.value;
  if (!find.matches.length) { sourceBackdrop.textContent = ''; return; }
  const frag = document.createDocumentFragment();
  let pos = 0;
  find.matches.forEach((m, i) => {
    if (m.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
    const mark = document.createElement('mark');
    mark.className = 'find-mark' + (i === find.index ? ' current' : '');
    mark.textContent = text.slice(m.start, m.end);
    frag.appendChild(mark);
    pos = m.end;
  });
  frag.appendChild(document.createTextNode(text.slice(pos) + '\n'));
  sourceBackdrop.replaceChildren(frag);
  sourceBackdrop.scrollTop = source.scrollTop; sourceBackdrop.scrollLeft = source.scrollLeft;
}
source.addEventListener('scroll', () => { sourceBackdrop.scrollTop = source.scrollTop; sourceBackdrop.scrollLeft = source.scrollLeft; });
function runFind({ keepIndex = false } = {}) {
  const q = findInput.value;
  const t = tabs.active();
  const prevIndex = find.index;
  clearFindMarks();
  if (!t || !q) { find.matches = []; find.index = -1; updateFindCount(); return; }
  if (t.mode === 'source') {
    find.matches = findMatches(source.value, q);
    find.index = find.matches.length ? (keepIndex && prevIndex >= 0 ? Math.min(prevIndex, find.matches.length - 1) : nearestIndex(find.matches, source.selectionStart)) : -1;
  } else {
    const index = collectText(preview, { skip: (n) => n.nodeName === 'svg' || n.classList.contains('mermaid') });
    find.matches = findMatches(index.text, q);
    find.ranges = find.matches.map((m) => {
      const r = matchToRange(index, m);
      const range = document.createRange();
      range.setStart(r.startNode, r.startOffset);
      range.setEnd(r.endNode, r.endOffset);
      return range;
    });
    find.index = find.matches.length ? (keepIndex && prevIndex >= 0 ? Math.min(prevIndex, find.matches.length - 1) : 0) : -1;
    if (hasHighlights && find.ranges.length) CSS.highlights.set('find-all', new Highlight(...find.ranges));
    else if (find.ranges.length) markRangesFallback();
  }
  showCurrentMatch();
}
function stepFind(dir) {
  if (!find.matches.length) { runFind(); if (!find.matches.length) return; }
  find.index = cycleIndex(find.index, find.matches.length, dir);
  showCurrentMatch();
}
function showCurrentMatch() {
  updateFindCount();
  if (find.index < 0) return;
  const t = tabs.active();
  const m = find.matches[find.index];
  if (t.mode === 'source') {
    source.setSelectionRange(m.start, m.end);
    renderSourceBackdrop();
    scrollTextareaToSelection();
  } else {
    const range = find.ranges[find.index];
    if (hasHighlights) CSS.highlights.set('find-current', new Highlight(range));
    else {
      preview.querySelectorAll('mark.find-mark.current').forEach((m) => m.classList.remove('current'));
      const m = range.startContainer.parentElement && range.startContainer.parentElement.closest('mark.find-mark');
      if (m) m.classList.add('current');
    }
    const rect = range.getBoundingClientRect();
    const box = preview.getBoundingClientRect();
    if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40) {
      preview.scrollTop += rect.top - box.top - box.height / 2;
    }
  }
}
function scrollTextareaToSelection() {
  // O espelho tem o mesmo layout do textarea: usa a posição real da marca.
  const mark = sourceBackdrop.querySelector('mark.current');
  if (!mark) return;
  const y = mark.offsetTop;
  if (y < source.scrollTop + 40 || y > source.scrollTop + source.clientHeight - 40) source.scrollTop = Math.max(0, y - source.clientHeight / 2);
  sourceBackdrop.scrollTop = source.scrollTop;
}
function updateFindCount() {
  const n = find.matches.length;
  findCount.textContent = !findInput.value ? '' : n ? `${find.index + 1} de ${n}` : 'nenhuma';
  findCount.classList.toggle('none', !!findInput.value && !n);
}
findInput.addEventListener('input', () => runFind());
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('find-next').addEventListener('click', () => stepFind(1));
$('find-prev').addEventListener('click', () => stepFind(-1));
$('find-close').addEventListener('click', closeFind);
$('btn-find').addEventListener('click', openFind);
let findRefresh = null;
const scheduleFindRefresh = () => { if (findbar.hidden) return; clearTimeout(findRefresh); findRefresh = setTimeout(() => runFind({ keepIndex: true }), 150); };
preview.addEventListener('input', scheduleFindRefresh);
source.addEventListener('input', scheduleFindRefresh);

// ---------- arquivos ----------
const OPEN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] },
  { name: 'Texto', extensions: TEXT_EXTENSIONS },
  { name: 'Todos os arquivos', extensions: ['*'] },
];

async function openFile() {
  let picked;
  try {
    picked = await open({ multiple: true, filters: OPEN_FILTERS });
  } catch (err) {
    reportError('falha ao abrir o seletor de arquivos', err);
    return;
  }
  if (!picked) return;
  await openPaths(Array.isArray(picked) ? picked : [picked]);
}

/** Abre vários caminhos; cada falha vira uma linha de status, nunca uma exceção. */
async function openPaths(paths) {
  const failed = [];
  let opened = 0;
  for (const p of paths) {
    const ok = await openPath(p, { quiet: true });
    if (ok) opened++; else failed.push(basename(p));
  }
  if (failed.length) setStatus(`não foi possível abrir: ${failed.join(', ')}`, { error: true });
  else if (opened === 1) setStatus('aberto');
  else if (opened > 1) setStatus(`${opened} arquivos abertos`);
}

// Abre um caminho em uma aba (ou foca a aba já aberta). Devolve true se abriu.
async function openPath(picked, { quiet = false } = {}) {
  const existing = tabs.findByPath(picked);
  if (existing) { switchTo(existing.id); return true; }
  let text;
  try {
    text = normalizeNewlines(await invoke('read_text', { path: picked }));
    if (!looksLikeText(text)) throw new Error('o arquivo não parece ser texto');
  } catch (err) {
    // Arquivo sumiu ou não pode ser lido: tira da lista de recentes.
    saveRecent(removeRecent(loadRecent(), picked));
    renderRecent();
    const msg = err && err.message ? err.message : String(err);
    if (!quiet) setStatus(`não foi possível abrir ${basename(picked)}: ${msg}`, { error: true });
    else console.warn('[kmdedit] abrir', picked, msg);
    return false;
  }
  openText({ path: picked, text, mode: defaultModeForPath(picked) });
  rememberRecent(picked);
  if (!quiet) setStatus('aberto');
  return true;
}

// Coloca um texto em uma aba (reaproveita a aba vazia e limpa, se for a atual).
function openText({ path = null, text, mode = 'wysiwyg' }) {
  captureCurrent();
  const cur = tabs.active();
  if (cur && !cur.path && !cur.dirty && !cur.text) {
    cur.path = path; cur.text = text; cur.mode = mode;
  } else {
    tabs.create({ path, text, mode });
  }
  showActive();
}

// ---------- arquivos recentes (até 20, únicos, persistidos) ----------
const RECENT_KEY = 'kmdedit.recent';
function loadRecent() {
  try { return normalizeRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')); }
  catch { return []; }
}
function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(normalizeRecent(list))); } catch { /* sem storage */ }
}
function rememberRecent(path) {
  saveRecent(addRecent(loadRecent(), path));
  renderRecent();
}
function renderRecent() {
  const list = loadRecent();
  recentSel.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = list.length ? `Recentes (${list.length})` : 'Sem recentes';
  recentSel.appendChild(head);
  for (const p of list) {
    const o = document.createElement('option');
    o.value = p;
    o.textContent = basename(p);
    o.title = p;
    recentSel.appendChild(o);
  }
  recentSel.value = '';
}
recentSel.addEventListener('change', () => {
  const p = recentSel.value;
  recentSel.value = '';
  if (p) openPath(p);
});

async function saveAs() {
  const t = tabs.active();
  if (!t) return;
  captureCurrent();
  let path;
  try {
    path = await save({
      defaultPath: t.path ? basename(t.path) : 'documento.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Texto', extensions: ['txt'] }],
    });
  } catch (err) {
    reportError('falha ao abrir o seletor', err);
    return;
  }
  if (!path) return;
  await writeTo(t, path);
}

async function saveFile() {
  const t = tabs.active();
  if (!t) return;
  captureCurrent();
  if (!t.path) return saveAs();
  await writeTo(t, t.path);
}

async function writeTo(t, path) {
  try {
    await invoke('write_text', { path, text: t.text });
  } catch (err) {
    reportError('falha ao salvar ' + basename(path), err);
    return;
  }
  t.path = path; t.dirty = false;
  rememberRecent(path);
  renderTabs();
  setStatus(isMarkdownPath(path) ? 'salvo' : 'salvo (texto simples)');
}

// ---------- arrastar e soltar arquivos ----------
// No Tauri o arrasto é nativo (onDragDropEvent): chega o caminho real e o
// arquivo é aberto pelo backend. Os eventos HTML5 ficam como alternativa para
// quando o app roda em um navegador comum (sem caminho: abre em aba sem título).
function showDrop(on) { dropOverlay.hidden = !on; }

async function setupDrop() {
  if (window.__TAURI_INTERNALS__) {
    try {
      await getCurrentWebview().onDragDropEvent((ev) => {
        const p = ev.payload;
        if (p.type === 'enter') showDrop(true);
        else if (p.type === 'leave') showDrop(false);
        else if (p.type === 'drop') { showDrop(false); openPaths(p.paths ?? []); }
      });
      return;
    } catch (err) {
      console.warn('[kmdedit] arrasto nativo indisponível, usando o do navegador:', err);
    }
  }
  document.addEventListener('dragover', (e) => { e.preventDefault(); showDrop(true); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) showDrop(false); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    showDrop(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    const failed = [];
    for (const f of files) {
      try {
        const text = normalizeNewlines(await f.text());
        if (!looksLikeText(text)) throw new Error('não é texto');
        openText({ text, mode: defaultModeForPath(f.name) });
      } catch { failed.push(f.name); }
    }
    if (failed.length) setStatus(`ignorado (não é texto): ${failed.join(', ')}`, { error: true });
  });
}

// ---------- fechamento da janela com alterações pendentes ----------
async function setupCloseGuard() {
  try {
    await getCurrentWindow().onCloseRequested(async (ev) => {
      captureCurrent();
      if (!tabs.anyDirty()) return;
      const ok = await ask('Há alterações não salvas. Sair mesmo assim?', { title: 'kMdedit', kind: 'warning' });
      if (!ok) ev.preventDefault();
    });
  } catch (err) {
    console.warn('[kmdedit] guarda de fechamento indisponível:', err);
  }
}

// ---------- eventos ----------
$('btn-new').addEventListener('click', newTab);
$('btn-open').addEventListener('click', openFile);
$('btn-save').addEventListener('click', saveFile);
$('btn-zoom-in').addEventListener('click', () => applyZoom(zoomStep(prefs.zoom, 1)));
$('btn-zoom-out').addEventListener('click', () => applyZoom(zoomStep(prefs.zoom, -1)));

source.addEventListener('input', markDirty);
preview.addEventListener('input', markDirty);

const isWysiwyg = () => tabs.active() && tabs.active().mode === 'wysiwyg';

// Ações globais (também acionadas pelo menu nativo). Os atalhos valem mesmo
// quando o menu nativo não os captura, por isso ficam nos dois lugares.
const ACTIONS = {
  new: newTab, open: openFile, save: saveFile, saveAs, find: openFind,
  close: () => { const t = tabs.active(); if (t) closeTab(t.id); },
  mode: cycleMode,
  modeWysiwyg: () => setMode('wysiwyg'), modeSource: () => setMode('source'), modeRender: () => setMode('render'),
  zoomIn: () => applyZoom(zoomStep(prefs.zoom, 1)),
  zoomOut: () => applyZoom(zoomStep(prefs.zoom, -1)),
  zoomReset: () => applyZoom(ZOOM_DEFAULT),
  themeLight: () => applyTheme('light'),
  themeDark: () => applyTheme('dark'),
  themeContrast: () => applyTheme('contrast'),
  nextTab: () => { captureCurrent(); tabs.step(1); showActive(); },
  prevTab: () => { captureCurrent(); tabs.step(-1); showActive(); },
};

document.addEventListener('keydown', (e) => {
  if (linkDialog.open) return;
  if (e.key === 'Escape' && !findbar.hidden) { e.preventDefault(); closeFind(); return; }
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  const act = (fn) => { e.preventDefault(); fn(); };
  if (!e.altKey && !e.shiftKey && k === 'n') return act(ACTIONS.new);
  if (!e.altKey && !e.shiftKey && k === 't') return act(ACTIONS.new);
  if (!e.altKey && !e.shiftKey && k === 'o') return act(ACTIONS.open);
  if (!e.altKey && !e.shiftKey && k === 's') return act(ACTIONS.save);
  if (!e.altKey && e.shiftKey && k === 's') return act(ACTIONS.saveAs);
  if (!e.altKey && !e.shiftKey && k === 'f') return act(ACTIONS.find);
  if (!e.altKey && !e.shiftKey && k === 'g') return act(() => stepFind(e.shiftKey ? -1 : 1));
  if (!e.altKey && !e.shiftKey && k === 'w') return act(ACTIONS.close);
  if (!e.altKey && e.shiftKey && k === 'r') return act(ACTIONS.mode);
  if (!e.altKey && !e.shiftKey && (k === '=' || k === '+')) return act(ACTIONS.zoomIn);
  if (!e.altKey && !e.shiftKey && (k === '-' || k === '_')) return act(ACTIONS.zoomOut);
  if (!e.altKey && !e.shiftKey && k === '0') return act(ACTIONS.zoomReset);
  if (!e.altKey && k === 'tab') return act(e.shiftKey ? ACTIONS.prevTab : ACTIONS.nextTab);
  if (isWysiwyg() && e.target !== findInput) {
    const action = formatShortcut(e);
    if (action && FMT[action]) return act(FMT[action]);
  }
});

// Recebe comandos do menu nativo (src-tauri) via evento.
listen('menu', (ev) => {
  const id = ev.payload;
  if (ACTIONS[id]) ACTIONS[id]();
  else if (isWysiwyg() && FMT[id]) FMT[id]();
}).catch((err) => console.warn('[kmdedit] menu nativo indisponível:', err));

// ---------- inicialização ----------
localizeHints();
try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* sem suporte */ }
ensureSandbox(document);
loadPrefs();
renderRecent();
tabs.create({ text: '', mode: 'wysiwyg' });
showActive();
setupDrop();
setupCloseGuard();
