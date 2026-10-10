// lib/render.mjs
// Renderização de Markdown com suporte a diagramas Mermaid.
//
// Módulo sem efeitos colaterais no DOM global: recebe `parse` (marked),
// `purify` (DOMPurify ou função sanitize) e `document` (browser ou jsdom),
// o que permite usar a mesma lógica no app e na suíte de testes.
//
// Fluxo:
//   1. markdown -> HTML (parse). Se o parser falhar, o documento é mostrado
//      como texto pré-formatado com a mensagem de erro, nunca uma tela vazia.
//   2. HTML -> HTML limpo (purify, anti-XSS)
//   3. blocos ```mermaid``` viram <div class="mermaid" data-src="..."> com o
//      código-fonte como textContent, prontos para o renderizador do mermaid.

export const MERMAID_CLASS = 'mermaid';
export const MERMAID_ATTR = 'data-mermaid';
export const RENDER_ERROR_CLASS = 'render-error';

/**
 * @param {string} source markdown
 * @param {object} opts
 * @param {(md:string)=>string} opts.parse
 * @param {{sanitize:Function}|Function} opts.purify
 * @param {Document} opts.document
 * @returns {string} HTML seguro, com blocos mermaid prontos para render.
 */
export function renderMarkdown(source, opts = {}) {
  const { parse, purify, document } = opts;
  if (typeof source !== 'string') {
    throw new TypeError('renderMarkdown: "source" deve ser string, recebeu ' + typeof source);
  }
  if (typeof parse !== 'function') throw new TypeError('renderMarkdown: requer { parse }');
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('renderMarkdown: requer um "document"');
  }
  const sanitize = resolveSanitizer(purify);

  // 1) Markdown -> HTML bruto. Falha do parser vira um bloco de erro visível.
  let rawHtml;
  try {
    rawHtml = String(parse(source));
  } catch (err) {
    return renderFailure(document, source, err);
  }

  // 2) Sanitização anti-XSS
  const clean = sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['div'],
    ADD_ATTR: ['data-mermaid', 'id', 'class'],
  });

  // 3) ```mermaid``` -> <div class="mermaid">
  const container = document.createElement('div');
  container.innerHTML = clean;
  container.querySelectorAll('code.language-mermaid, pre code[class*="language-mermaid"]').forEach((codeEl) => {
    const text = (codeEl.textContent || '').trim();
    let target = codeEl;
    if (codeEl.parentElement && codeEl.parentElement.tagName === 'PRE') target = codeEl.parentElement;
    if (!target.parentElement) return;
    const div = document.createElement('div');
    div.className = MERMAID_CLASS;
    div.setAttribute(MERMAID_ATTR, '1');
    div.setAttribute('data-src', text); // fonte preservada para o WYSIWYG
    div.textContent = text;
    target.parentElement.replaceChild(div, target);
  });

  return container.innerHTML;
}

function resolveSanitizer(purify) {
  let sanitize = purify;
  if (purify && typeof purify.sanitize === 'function') sanitize = purify.sanitize.bind(purify);
  if (typeof sanitize !== 'function') {
    throw new TypeError('renderMarkdown: "purify" deve ser a instância do DOMPurify (com .sanitize) ou uma função (html, opts) => string');
  }
  return sanitize;
}

/** HTML de fallback quando o parser falha: aviso + fonte como texto. */
function renderFailure(document, source, err) {
  const box = document.createElement('div');
  box.className = RENDER_ERROR_CLASS;
  const title = document.createElement('p');
  title.className = 'render-error-title';
  title.textContent = 'Não foi possível renderizar o documento: ' + (err && err.message ? err.message : String(err));
  const pre = document.createElement('pre');
  pre.textContent = source;
  box.append(title, pre);
  return box.outerHTML;
}

/** Conta quantos diagramas mermaid a fonte contém. */
export function countMermaidBlocks(source, { parse, purify, document } = {}) {
  const html = renderMarkdown(source, { parse, purify, document });
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.querySelectorAll('.' + MERMAID_CLASS).length;
}

/** Conta os <div class="mermaid"> em `root` (ou no documento, se não houver root). */
export function countMermaidDivs(document, root) {
  const el = root && typeof root.querySelectorAll === 'function'
    ? root.querySelectorAll('.' + MERMAID_CLASS)
    : document.querySelectorAll('.' + MERMAID_CLASS);
  return el.length;
}
