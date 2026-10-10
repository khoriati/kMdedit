// lib/convert.mjs
// Conversao HTML (DOM editado no modo WYSIWYG) -> Markdown.
// Blocos Mermaid renderizados (SVG) voltam a ser ```mermaid``` usando o
// atributo data-src, porque o textContent do SVG nao e o codigo-fonte.

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  td.use(gfm);
  td.addRule('mermaid', {
    filter: (node) =>
      node.nodeName === 'DIV' && node.classList && node.classList.contains('mermaid'),
    replacement: (_content, node) => {
      const src = node.getAttribute('data-src') ?? node.textContent ?? '';
      return '\n\n```mermaid\n' + src.trim() + '\n```\n\n';
    },
  });
  return td;
}

/**
 * @param {Node} node elemento DOM (ex.: o container do preview)
 * @param {TurndownService} [td]
 * @returns {string} Markdown com \n finais
 */
export function htmlToMarkdown(node, td = createTurndown()) {
  const md = td.turndown(node).replace(/\n{3,}/g, '\n\n').trim();
  return md ? md + '\n' : '';
}
