// lib/find.mjs — busca em texto (funções puras, usadas no modo Código e no
// texto plano extraído do preview).

/**
 * Encontra todas as ocorrências de `query` em `text`.
 * @returns {{start:number,end:number}[]} posições (end exclusivo)
 */
export function findMatches(text, query, { caseSensitive = false } = {}) {
  const out = [];
  if (!query) return out;
  const hay = caseSensitive ? String(text) : String(text).toLowerCase();
  const needle = caseSensitive ? String(query) : String(query).toLowerCase();
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    out.push({ start: i, end: i + needle.length });
    i += Math.max(1, needle.length);
  }
  return out;
}

/** Índice do primeiro match que começa em `from` ou depois (ou 0 se nenhum). */
export function nearestIndex(matches, from) {
  const i = matches.findIndex((m) => m.start >= from);
  return i === -1 ? 0 : i;
}

/** Avança/retrocede com volta ao início/fim. */
export function cycleIndex(i, n, dir) {
  if (!n) return -1;
  return ((i + dir) % n + n) % n;
}

/**
 * Concatena os nós de texto de `root` em uma string única, guardando os
 * offsets de cada nó, para mapear posições de match de volta ao DOM.
 * `skip(node)` permite ignorar subárvores (ex.: SVGs de diagramas).
 */
export function collectText(root, { skip = () => false, document = root.ownerDocument } = {}) {
  const nodes = [];
  let text = '';
  const TEXT = 3, ELEMENT = 1;
  const walk = (n) => {
    if (n.nodeType === TEXT) {
      nodes.push({ node: n, start: text.length });
      text += n.nodeValue;
    } else if (n.nodeType === ELEMENT) {
      if (skip(n)) return;
      for (const c of n.childNodes) walk(c);
    }
  };
  walk(root);
  return { text, nodes, document };
}

/** Converte um match (offsets no texto concatenado) em {startNode,startOffset,endNode,endOffset}. */
export function matchToRange(index, match) {
  const locate = (pos, preferEnd) => {
    let lo = 0, hi = index.nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (index.nodes[mid].start <= pos) lo = mid; else hi = mid - 1;
    }
    let n = index.nodes[lo];
    // Se o ponto cai exatamente no início de um nó e queremos o fim do anterior
    if (preferEnd && lo > 0 && n.start === pos) n = index.nodes[lo - 1];
    return { node: n.node, offset: pos - n.start };
  };
  const s = locate(match.start, false);
  const e = locate(match.end, true);
  return { startNode: s.node, startOffset: s.offset, endNode: e.node, endOffset: e.offset };
}
