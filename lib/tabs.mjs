// lib/tabs.mjs — estado puro de abas, zoom e tema (sem DOM, testável no node).

export const THEMES = ['light', 'dark', 'contrast'];
export const MODES = ['render', 'wysiwyg', 'source'];
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

export function basename(p) {
  return String(p).split(/[\\/]/).pop();
}

export function normalizeTheme(t) {
  return THEMES.includes(t) ? t : 'light';
}

export function normalizeMode(m) {
  return MODES.includes(m) ? m : 'wysiwyg';
}

/** Limita o zoom ao intervalo e arredonda para passos de 0,1. */
export function clampZoom(z) {
  const n = Number(z);
  const v = Number.isFinite(n) ? n : ZOOM_DEFAULT;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v)) * 10) / 10;
}

export function zoomStep(z, dir) {
  return clampZoom(clampZoom(z) + dir * ZOOM_STEP);
}

/** Conjunto de abas abertas em uma janela. Uma aba = um documento. */
export class TabStore {
  constructor() {
    this.tabs = [];
    this.activeId = null;
    this.seq = 0;
  }

  create({ path = null, text = '', mode = 'wysiwyg' } = {}) {
    const tab = {
      id: ++this.seq,
      path,
      text,
      mode: normalizeMode(mode),
      dirty: false, // há alterações não salvas
      edited: false, // edição no WYSIWYG ainda não convertida para texto
    };
    this.tabs.push(tab);
    this.activeId = tab.id;
    return tab;
  }

  get(id) {
    return this.tabs.find((t) => t.id === id) ?? null;
  }

  active() {
    return this.get(this.activeId);
  }

  findByPath(path) {
    return path ? this.tabs.find((t) => t.path === path) ?? null : null;
  }

  activate(id) {
    if (this.get(id)) this.activeId = id;
    return this.active();
  }

  /** Vai para a próxima (dir=1) ou anterior (dir=-1) aba, com volta ao início/fim. */
  step(dir) {
    if (!this.tabs.length) return null;
    const i = this.tabs.findIndex((t) => t.id === this.activeId);
    const n = (i + dir + this.tabs.length) % this.tabs.length;
    return this.activate(this.tabs[n].id);
  }

  /** Remove a aba. Se era a ativa, ativa a vizinha da direita (ou a da esquerda). */
  close(id) {
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i < 0) return null;
    this.tabs.splice(i, 1);
    if (this.activeId === id) {
      const next = this.tabs[Math.min(i, this.tabs.length - 1)] ?? null;
      this.activeId = next ? next.id : null;
    }
    return this.active();
  }

  anyDirty() {
    return this.tabs.some((t) => t.dirty);
  }

  title(tab) {
    return (tab.path ? basename(tab.path) : 'Sem título') + (tab.dirty ? ' •' : '');
  }
}
