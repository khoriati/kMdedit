// lib/editing.mjs — decisões de edição no WYSIWYG, sem DOM (testáveis).
// O app traduz cada decisão em manipulação do contenteditable.

/**
 * Tecla dentro de um bloco de código (<pre><code>).
 * O navegador, por padrão, divide o <pre> em dois ao dar Enter, o que parece
 * "abrir outro bloco". Aqui o Enter vira uma quebra de linha dentro do código;
 * Cmd/Ctrl+Enter (ou Enter em duas linhas vazias no fim) sai do bloco, como no Typora.
 *
 * @param {object} p
 * @param {string} p.key           'Enter' | 'Tab' | 'Backspace' | 'ArrowDown' | ...
 * @param {boolean} [p.mod]        Cmd/Ctrl pressionado
 * @param {boolean} [p.shift]
 * @param {string} p.before        texto do bloco antes do cursor
 * @param {string} p.after         texto do bloco depois do cursor
 * @returns {null | {type:'newline'|'exit'|'indent'|'outdent'|'remove'}}
 */
export function codeBlockKey({ key, mod = false, shift = false, before = '', after = '' }) {
  if (key === 'Enter') {
    if (mod) return { type: 'exit' };
    // Enter com o cursor no fim, após uma linha vazia: sai do bloco e limpa as vazias.
    if (!after.replace(/\n$/, '') && /\n\n$/.test(before)) return { type: 'exit', trimEmptyLines: true };
    return { type: 'newline' };
  }
  if (key === 'Tab') return shift ? { type: 'outdent' } : { type: 'indent' };
  if (key === 'Backspace' && !before && !after.replace(/\n$/, '')) return { type: 'remove' };
  if (key === 'ArrowDown' && !after.replace(/\n$/, '') && !shift) return { type: 'exit-if-last' };
  return null;
}

/** Texto do bloco de código normalizado para salvar: um '\n' final, sem '\n' duplicado do WebKit. */
export function normalizeCodeText(text) {
  return String(text ?? '').replace(/\n+$/, '') + '\n';
}

/** Atalhos de formatação estilo Typora. `code` é KeyboardEvent.code (independe do layout/Alt). */
export const FORMAT_SHORTCUTS = [
  { code: 'Digit1', mod: true, alt: false, shift: false, action: 'h1' },
  { code: 'Digit2', mod: true, alt: false, shift: false, action: 'h2' },
  { code: 'Digit3', mod: true, alt: false, shift: false, action: 'h3' },
  { code: 'Digit4', mod: true, alt: false, shift: false, action: 'h4' },
  { code: 'Digit5', mod: true, alt: false, shift: false, action: 'h5' },
  { code: 'Digit6', mod: true, alt: false, shift: false, action: 'h6' },
  { code: 'KeyB', mod: true, alt: false, shift: false, action: 'bold' },
  { code: 'KeyI', mod: true, alt: false, shift: false, action: 'italic' },
  { code: 'KeyE', mod: true, alt: false, shift: false, action: 'code' },
  { code: 'KeyK', mod: true, alt: false, shift: false, action: 'link' },
  { code: 'KeyU', mod: true, alt: true, shift: false, action: 'ul' },
  { code: 'KeyO', mod: true, alt: true, shift: false, action: 'ol' },
  { code: 'KeyX', mod: true, alt: true, shift: false, action: 'task' },
  { code: 'KeyQ', mod: true, alt: true, shift: false, action: 'quote' },
  { code: 'KeyC', mod: true, alt: true, shift: false, action: 'codeblock' },
  { code: 'KeyM', mod: true, alt: true, shift: false, action: 'mermaid' },
  { code: 'KeyS', mod: true, alt: false, shift: true, action: null }, // reservado: salvar como
  { code: 'Minus', mod: true, alt: true, shift: false, action: 'hr' },
];

/** Resolve um KeyboardEvent-like ({code, metaKey, ctrlKey, altKey, shiftKey}) em ação de formatação. */
export function formatShortcut(e) {
  const mod = !!(e.metaKey || e.ctrlKey);
  for (const s of FORMAT_SHORTCUTS) {
    if (s.code === e.code && s.mod === mod && s.alt === !!e.altKey && s.shift === !!e.shiftKey) return s.action;
  }
  return null;
}
