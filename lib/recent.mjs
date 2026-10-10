// lib/recent.mjs — lista de arquivos recentes (funções puras).
// Regras: mais recente primeiro, sem duplicatas, no máximo MAX_RECENT itens.

export const MAX_RECENT = 20;

/** Normaliza uma lista vinda do armazenamento: só strings não vazias, sem duplicatas, com limite. */
export function normalizeRecent(list, max = MAX_RECENT) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    if (typeof p === 'string' && p.trim() && !out.includes(p)) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** Registra um arquivo aberto/salvo: vai para o topo, sem duplicar, respeitando o limite. */
export function addRecent(list, path, max = MAX_RECENT) {
  const base = normalizeRecent(list, Infinity).filter((p) => p !== path);
  if (typeof path === 'string' && path.trim()) base.unshift(path);
  return base.slice(0, max);
}

/** Remove um caminho (ex.: arquivo que não existe mais). */
export function removeRecent(list, path) {
  return normalizeRecent(list, Infinity).filter((p) => p !== path);
}
