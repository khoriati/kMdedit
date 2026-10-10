// ui/app.js — frontend do mdedit (Tauri). Lógica pura fica em lib/*.mjs.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { renderMarkdown } from '../lib/render.mjs';
import { renderMermaidBlocks, ensureSandbox } from '../lib/mermaid.mjs';
import { htmlToMarkdown } from '../lib/convert.mjs';
import { basename, defaultModeForPath, isMarkdownPath, normalizeNewlines, looksLikeText, TEXT_EXTENSIONS } from '../lib/text.mjs';
import { TabStore, clampZoom, zoomStep, normalizeTheme, ZOOM_DEFAULT } from '../lib/tabs.mjs';
import { blockRule, inlineRule } from '../lib/rules.mjs';
import { addRecent, normalizeRecent, removeRecent } from '../lib/recent.mjs';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save, ask } from '@tauri-apps/plugin-dialog';

const $ = (id) => document.getElementById(id);
const source = $('source');
const preview = $('preview');
const tabbar = $('tabbar');
const status = $('status');
const modeBtn = $('btn-mode');
const zoomLabel = $('zoom-label');
const fmtbar = $('fmtbar');
const recentSel = $('recent');
const dropOverlay = $('drop-overlay');
const linkDialog = $('link-dialog');

const tabs = new TabStore();
const prefs = { theme: 'light', zoom: ZOOM_DEFAULT };
const MODE_LABEL = { render: 'Visualizar', wysiwyg: 'WYSIWYG', source: 'Código' };
const MERMAID_THEME = { light: 'default', dark: 'dark', contrast: 'neutral' };

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
  console.error(`[mdedit] ${context}:`, err);
  setStatus(`${context}: ${msg}`, { error: true });
}
// Nada que escape de um handler pode derrubar a interface: registra e segue.
window.addEventListener('error', (e) => { reportError('erro inesperado', e.error ?? e.message); });
window.addEventListener('unhandledrejection', (e) => { e.preventDefault(); reportError('erro inesperado', e.reason); });

// ---------- preferências (tema e zoom) ----------
function initMermaid() {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: MERMAID_THEME[prefs.theme] ?? 'default',
    logLevel: 'fatal',
  });
  // O mermaid chama parseError em vez de deixar a exceção escapar: silencia o padrão.
  mermaid.parseError = () => {};
}
function applyTheme(theme, { rerender = true } = {}) {
  const changed = prefs.theme !== normalizeTheme(theme);
  prefs.theme = normalizeTheme(theme);
  document.body.dataset.theme = prefs.theme;
  try { localStorage.setItem('mdedit.theme', prefs.theme); } catch { /* sem storage */ }
  initMermaid();
  // Só o modo Visualizar é redesenhado: no WYSIWYG isso perderia o cursor.
  const t = tabs.active();
  if (changed && rerender && t && t.mode === 'render') renderPreview();
}
function applyZoom(z) {
  prefs.zoom = clampZoom(z);
  document.documentElement.style.setProperty('--zoom', String(prefs.zoom));
  zoomLabel.textContent = Math.round(prefs.zoom * 100) + '%';
  try { localStorage.setItem('mdedit.zoom', String(prefs.zoom)); } catch { /* sem storage */ }
}
function loadPrefs() {
  let theme = 'light';
  let zoom = ZOOM_DEFAULT;
  try {
    theme = localStorage.getItem('mdedit.theme') || theme;
    zoom = Number(localStorage.getItem('mdedit.zoom')) || zoom;
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
    close.title = 'Fechar aba (Cmd/Ctrl+W)';
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });
    el.append(name, close);
    el.addEventListener('click', () => switchTo(t.id));
    tabbar.appendChild(el);
  }
  const plus = document.createElement('button');
  plus.className = 'tab-new';
  plus.textContent = '+';
  plus.title = 'Nova aba (Cmd/Ctrl+T)';
  plus.addEventListener('click', newTab);
  tabbar.appendChild(plus);
  document.title = tabs.active() ? 'mdedit — ' + tabs.title(tabs.active()) : 'mdedit';
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
    const ok = await ask(`"${tabs.title(t).replace(' •', '')}" tem alterações não salvas. Fechar mesmo assim?`, { title: 'mdedit', kind: 'warning' });
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
    preview.innerHTML = html;
    const r = await renderMermaidBlocks(preview, { mermaid, document, isStale });
    if (isStale()) return;
    if (r.failed) setStatus(`${r.failed} diagrama(s) Mermaid com erro`, { error: true });
  } catch (err) {
    if (!isStale()) reportError('falha ao renderizar', err);
  }
}

// ---------- formatação e digitação estilo Typora (WYSIWYG) ----------
// Os comandos usam execCommand, que o WebKit do Tauri ainda aceita.
const exec = (cmd, val = null) => { preview.focus(); document.execCommand(cmd, false, val); markDirty(); };
function markDirty() { const t = tabs.active(); if (t && !t.dirty) { t.dirty = true; renderTabs(); } }

// Bloco (parágrafo/cabeçalho/item) que contém o cursor.
function currentBlock() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !preview.contains(sel.anchorNode)) return null;
  let n = sel.anchorNode;
  while (n && n !== preview && !(n.nodeType === 1 && /^(P|H[1-6]|LI|BLOCKQUOTE|DIV|PRE)$/.test(n.nodeName))) n = n.parentNode;
  if (!n || n === preview) return null;
  // Diagramas e blocos de erro não são editáveis.
  if (n.closest('.mermaid, .render-error')) return null;
  return n;
}

// Texto do bloco até o cursor.
function textBeforeCaret(block) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(block);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString();
}

// Apaga exatamente os caracteres digitados do marcador (ex.: "###").
function consumeBlockText(len) {
  for (let i = 0; i < len; i++) document.execCommand('delete');
}

function insertCodeBlock(lang = '') {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  if (lang) code.className = 'language-' + lang;
  code.textContent = '\n';
  pre.appendChild(code);
  const r = sel.getRangeAt(0);
  r.collapse(false);
  r.insertNode(pre);
  const nr = document.createRange();
  nr.setStart(code.firstChild, 0);
  nr.collapse(true);
  sel.removeAllRanges(); sel.addRange(nr);
  markDirty();
}

// Regras de digitação: "# " vira título, "```" + Enter vira bloco de código etc.
preview.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const block = currentBlock();
  if (!block || block.nodeName === 'PRE') return;
  const before = textBeforeCaret(block);
  const rule = blockRule(before, e.key === ' ' ? ' ' : 'Enter');
  if (!rule) return;
  e.preventDefault();
  consumeBlockText(before.length);
  if (rule.kind === 'heading') exec('formatBlock', 'H' + rule.level);
  else if (rule.kind === 'quote') exec('formatBlock', 'BLOCKQUOTE');
  else if (rule.kind === 'ul') exec('insertUnorderedList');
  else if (rule.kind === 'ol') exec('insertOrderedList');
  else if (rule.kind === 'fence') insertCodeBlock(rule.lang);
  else if (rule.kind === 'hr') exec('insertHorizontalRule');
});

// Regras inline: "`código`", "**negrito**", "*itálico*", "~~tachado~~" ao fechar o span.
preview.addEventListener('input', (e) => {
  if (e.inputType !== 'insertText' || !/[`*~]/.test(e.data || '')) return;
  const block = currentBlock();
  if (!block || block.nodeName === 'PRE') return;
  const before = textBeforeCaret(block);
  const rule = inlineRule(before);
  if (!rule) return;
  // Remove o markdown fechado e insere o elemento formatado. Inserir o HTML
  // direto (em vez de alternar bold/italic) evita que o formato vaze para o texto seguinte.
  consumeBlockText(rule.full.length);
  const tag = { code: 'code', strong: 'strong', em: 'em', strike: 's' }[rule.kind];
  exec('insertHTML', `<${tag}>${escapeHtml(rule.inner)}</${tag}>`);
});

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

// Botões da barra de formatação.
const FMT = {
  h1: () => exec('formatBlock', 'H1'),
  h2: () => exec('formatBlock', 'H2'),
  h3: () => exec('formatBlock', 'H3'),
  bold: () => exec('bold'),
  italic: () => exec('italic'),
  strike: () => exec('strikeThrough'),
  code: () => wrapSelection('code'),
  ul: () => exec('insertUnorderedList'),
  ol: () => exec('insertOrderedList'),
  quote: () => exec('formatBlock', 'BLOCKQUOTE'),
  codeblock: () => insertCodeBlock(''),
  mermaid: () => insertCodeBlock('mermaid'),
  hr: () => exec('insertHorizontalRule'),
  link: askLink,
};

function wrapSelection(kind) {
  const sel = window.getSelection();
  const text = sel && sel.toString();
  if (!text) return;
  exec('insertHTML', kind === 'code' ? `<code>${escapeHtml(text)}</code>` : escapeHtml(text));
}

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
  preview.contentEditable = mode === 'wysiwyg' ? 'true' : 'false';
  if (mode === 'source') {
    renderGen++; // cancela diagramas pendentes
    preview.hidden = true; source.hidden = false; source.focus();
  } else {
    source.hidden = true; preview.hidden = false;
    renderPreview().then(() => { if (mode === 'wysiwyg' && tabs.active() === t) preview.focus(); });
  }
  modeBtn.textContent = MODE_LABEL[mode];
  fmtbar.hidden = mode !== 'wysiwyg';
  renderTabs();
}

// Ciclo Cmd/Ctrl+Shift+R: WYSIWYG -> Código -> Visualizar -> WYSIWYG.
function cycleMode() {
  const cur = tabs.active() ? tabs.active().mode : 'wysiwyg';
  const next = { wysiwyg: 'source', source: 'render', render: 'wysiwyg' };
  setMode(next[cur]);
}

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
    else console.warn('[mdedit] abrir', picked, msg);
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
const RECENT_KEY = 'mdedit.recent';
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
      console.warn('[mdedit] arrasto nativo indisponível, usando o do navegador:', err);
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
      const ok = await ask('Há alterações não salvas. Sair mesmo assim?', { title: 'mdedit', kind: 'warning' });
      if (!ok) ev.preventDefault();
    });
  } catch (err) {
    console.warn('[mdedit] guarda de fechamento indisponível:', err);
  }
}

// ---------- eventos ----------
$('btn-new').addEventListener('click', newTab);
$('btn-open').addEventListener('click', openFile);
$('btn-save').addEventListener('click', saveFile);
modeBtn.addEventListener('click', cycleMode);
$('btn-zoom-in').addEventListener('click', () => applyZoom(zoomStep(prefs.zoom, 1)));
$('btn-zoom-out').addEventListener('click', () => applyZoom(zoomStep(prefs.zoom, -1)));

source.addEventListener('input', markDirty);
preview.addEventListener('input', markDirty);

const isWysiwyg = () => tabs.active() && tabs.active().mode === 'wysiwyg';

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || linkDialog.open) return;
  const k = e.key.toLowerCase();
  const act = (fn) => { e.preventDefault(); fn(); };
  if (!e.shiftKey && k === 'n') return act(newTab);
  if (!e.shiftKey && k === 't') return act(newTab);
  if (!e.shiftKey && k === 'o') return act(openFile);
  if (!e.shiftKey && k === 's') return act(saveFile);
  if (e.shiftKey && k === 's') return act(saveAs);
  if (!e.shiftKey && k === 'w') return act(() => { const t = tabs.active(); if (t) closeTab(t.id); });
  if (e.shiftKey && k === 'r') return act(cycleMode);
  if (!e.shiftKey && (k === '=' || k === '+')) return act(() => applyZoom(zoomStep(prefs.zoom, 1)));
  if (!e.shiftKey && (k === '-' || k === '_')) return act(() => applyZoom(zoomStep(prefs.zoom, -1)));
  if (!e.shiftKey && k === '0') return act(() => applyZoom(ZOOM_DEFAULT));
  if (k === 'tab') return act(() => { captureCurrent(); tabs.step(e.shiftKey ? -1 : 1); showActive(); });
  if (isWysiwyg()) {
    if (!e.shiftKey && k === 'b') return act(FMT.bold);
    if (!e.shiftKey && k === 'i') return act(FMT.italic);
    if (!e.shiftKey && k === 'e') return act(FMT.code);
    if (!e.shiftKey && k === 'k') return act(FMT.link);
  }
});

// Recebe comandos do menu nativo (src-tauri) via evento.
listen('menu', (ev) => {
  const id = ev.payload;
  const map = {
    new: newTab, open: openFile, save: saveFile, saveAs,
    close: () => { const t = tabs.active(); if (t) closeTab(t.id); },
    mode: cycleMode,
    zoomIn: () => applyZoom(zoomStep(prefs.zoom, 1)),
    zoomOut: () => applyZoom(zoomStep(prefs.zoom, -1)),
    zoomReset: () => applyZoom(ZOOM_DEFAULT),
    themeLight: () => applyTheme('light'),
    themeDark: () => applyTheme('dark'),
    themeContrast: () => applyTheme('contrast'),
  };
  if (map[id]) map[id]();
}).catch((err) => console.warn('[mdedit] menu nativo indisponível:', err));

// ---------- inicialização ----------
ensureSandbox(document);
loadPrefs();
renderRecent();
tabs.create({ text: '', mode: 'wysiwyg' });
showActive();
setupDrop();
setupCloseGuard();
