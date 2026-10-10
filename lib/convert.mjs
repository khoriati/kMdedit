// lib/convert.mjs
// Conversão HTML (DOM editado no modo WYSIWYG) -> Markdown.
// Blocos Mermaid renderizados (SVG) voltam a ser ```mermaid``` usando o
// atributo data-src, porque o textContent do SVG não é o código-fonte.

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  td.use(gfm);

  // Tachado em GFM é com dois tis; o plugin usa um só.
  td.addRule('strike', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => (content ? '~~' + content + '~~' : ''),
  });

  // Itens de lista com um único espaço após o marcador ("- a", "1. a"),
  // indentação de aninhamento proporcional e checkbox sem espaço duplo.
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      content = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/^\[( |x)\]\s+/, '[$1] ');
      let prefix = options.bulletListMarker + ' ';
      const parent = node.parentNode;
      if (parent.nodeName === 'OL') {
        const start = parent.getAttribute('start');
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + '. ';
      }
      const indent = ' '.repeat(prefix.length);
      content = content.replace(/\n/gm, '\n' + indent);
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    },
  });

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
 * Reduz 3+ quebras de linha seguidas a 2, mas nunca dentro de blocos de
 * código cercados, onde linhas vazias fazem parte do conteúdo.
 */
export function collapseBlankLines(md) {
  const lines = String(md).split('\n');
  const out = [];
  let fence = null;
  let blank = 0;
  for (const line of lines) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (m) { fence = m[1]; blank = 0; out.push(line); continue; }
    if (line.trim() === '') { if (++blank > 1) continue; } else blank = 0;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Limpa artefatos que o contenteditable deixa no DOM antes de converter:
 * <br> no fim de blocos (viraria quebra dura "  \n"), separadores de largura
 * zero usados para posicionar o cursor e espaços não separáveis.
 * Trabalha em um clone; o DOM editável não é alterado.
 */
export function cleanEditableClone(node) {
  const clone = node.cloneNode(true);
  const doc = clone.ownerDocument;
  const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, div';
  for (const el of clone.querySelectorAll(BLOCKS)) {
    let last = el.lastChild;
    while (last && last.nodeType === 3 && !last.nodeValue.trim()) last = last.previousSibling;
    if (last && last.nodeName === 'BR') last.remove();
  }
  const walker = doc.createTreeWalker(clone, 4 /* NodeFilter.SHOW_TEXT */);
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n);
  for (const t of texts) {
    if (t.parentElement && t.parentElement.closest('pre')) { t.nodeValue = t.nodeValue.replace(/\u200B/g, ''); continue; }
    t.nodeValue = t.nodeValue.replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
  }
  return clone;
}

/**
 * @param {Node} node elemento DOM (ex.: o container do preview)
 * @param {TurndownService} [td]
 * @returns {string} Markdown com \n final
 */
export function htmlToMarkdown(node, td = createTurndown()) {
  const md = collapseBlankLines(td.turndown(cleanEditableClone(node))).trim();
  return md ? md + '\n' : '';
}
