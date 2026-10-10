// lib/text.mjs — utilitários puros de texto/caminho, sem dependência de fs.
// Usado pelo frontend (ui/app.js), que roda no WebView do Tauri.

const MARKDOWN_EXT = /\.(md|markdown|mdx)$/i;

/** Extensões de texto reconhecidas além do Markdown (só para o filtro de abrir). */
export const TEXT_EXTENSIONS = ['txt', 'text', 'log', 'rst', 'adoc', 'org', 'csv', 'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'xml', 'html', 'css', 'js', 'ts'];

/** Valida caminho e extensão Markdown (.md/.markdown/.mdx). */
export function isMarkdownPath(p) {
  return typeof p === 'string' && MARKDOWN_EXT.test(p);
}

/** Padroniza CRLF/CR -> LF (evita drift ao salvar). Mantém o texto fiel. */
export function normalizeNewlines(text) {
  return String(text == null ? '' : text).replace(/\r\n?/g, '\n');
}

/** Nome do arquivo sem o diretório (aceita / e \). */
export function basename(p) {
  return String(p ?? '').split(/[\\/]/).pop();
}

/** Extensão em minúsculas, sem o ponto; '' se não houver. */
export function extensionOf(p) {
  const name = basename(p);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Modo de edição inicial para um caminho: Markdown abre em WYSIWYG; qualquer
 * outro texto abre em Código, para não reformatar conteúdo que não é Markdown.
 */
export function defaultModeForPath(p) {
  return isMarkdownPath(p) ? 'wysiwyg' : 'source';
}

/**
 * Heurística de "é texto": sem byte NUL e com poucos bytes de controle.
 * Recebe o texto já decodificado (o backend recusa UTF-8 inválido antes).
 */
export function looksLikeText(sample) {
  const s = String(sample ?? '');
  if (!s) return true;
  if (s.includes('\u0000')) return false;
  let control = 0;
  const n = Math.min(s.length, 8000);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) control++;
  }
  return control / n < 0.05;
}
