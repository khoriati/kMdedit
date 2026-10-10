// lib/rules.mjs — regras de digitação estilo Typora (funções puras, testáveis).
// As regras só disparam em padrões de fechamento ou em espaço/Enter no início
// de um bloco. Um '#', '`' ou '*' digitado no meio do texto é sempre literal.

/**
 * Regras de bloco. `text` é o conteúdo do bloco até o cursor, sem a tecla.
 * `key` é ' ' (espaço, para "# ", "> ", "- ", "1. ") ou 'Enter' (para "```" e "---").
 * @returns {null | {kind: string, level?: number, lang?: string}}
 */
export function blockRule(text, key) {
  if (key === ' ') {
    const h = /^(#{1,6})$/.exec(text);
    if (h) return { kind: 'heading', level: h[1].length };
    if (text === '>') return { kind: 'quote' };
    if (text === '-' || text === '*' || text === '+') return { kind: 'ul' };
    if (text === '1.') return { kind: 'ol' };
    return null;
  }
  if (key === 'Enter') {
    const f = /^```([\w+-]*)$/.exec(text);
    if (f) return { kind: 'fence', lang: f[1] || '' };
    if (text === '---' || text === '***' || text === '___') return { kind: 'hr' };
    return null;
  }
  return null;
}

// Ordem importa: código primeiro, para que `**` dentro de `código` não vire negrito.
// Conteúdo não pode começar nem terminar com espaço (ex.: "2 * 3 *" não é itálico).
const INLINE = [
  { kind: 'code', re: /`([^`\n]+)`$/ },
  { kind: 'strong', re: /\*\*(?!\s)([^*\n]*[^*\s])\*\*$/ },
  { kind: 'strike', re: /~~(?!\s)([^~\n]*[^~\s])~~$/ },
  { kind: 'em', re: /(?<![*\w])\*(?!\s)([^*\n]*[^*\s])\*$/ },
];

/**
 * Regras inline: detecta um span Markdown que acabou de ser fechado no fim de `text`.
 * @returns {null | {kind: string, full: string, inner: string}}
 */
export function inlineRule(text) {
  for (const { kind, re } of INLINE) {
    const m = re.exec(text);
    if (m) return { kind, full: m[0], inner: m[1] };
  }
  return null;
}
