// lib/mermaid.mjs — renderização segura de blocos Mermaid.
//
// Por que existe: o mermaid.render() (v10) anexa um <div> temporário ao <body>
// e, quando o diagrama tem erro de sintaxe, lança a exceção ANTES de remover
// esse <div>. O resultado é um SVG de erro com width=100% preso no fim da
// página a cada tentativa, o que desestabiliza o layout do editor.
//
// Estratégia:
//   1. validar com mermaid.parse() antes de desenhar (erro não chega ao render);
//   2. desenhar dentro de um container isolado e fora da tela (3º argumento do
//      render), nunca direto no <body>;
//   3. limpar o container e qualquer resíduo "d<id>"/"i<id>" em qualquer saída;
//   4. limitar o tempo de cada diagrama (timeout) e serializar as execuções;
//   5. em caso de falha, mostrar o código-fonte com a mensagem, preservando
//      data-src para que o WYSIWYG consiga reconverter para ```mermaid```.
//
// A instância do mermaid é injetada, o que permite testar com um dublê.

export const SANDBOX_ID = 'mermaid-sandbox';
export const ERROR_CLASS = 'mermaid-error';
export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_WIDTH = 900;

/** Mensagem curta e legível a partir do que o mermaid lançar (Error, string, objeto). */
export function describeRenderError(err) {
  if (err == null) return 'erro desconhecido';
  if (typeof err === 'string') return firstLine(err);
  if (err instanceof Error || typeof err.message === 'string') return firstLine(err.message || err.name || 'erro');
  if (typeof err.str === 'string') return firstLine(err.str); // formato do parseError do mermaid
  try { return firstLine(JSON.stringify(err)); } catch { return 'erro desconhecido'; }
}

// O mermaid descreve o erro em várias linhas ("Parse error on line 3:", o
// trecho, o marcador "---^" e o esperado). Junta as linhas úteis em uma só.
function firstLine(s) {
  const lines = String(s).split('\n').map((l) => l.trim()).filter((l) => l && !/^-*\^$/.test(l));
  const line = lines.join(' ') || 'erro';
  return line.length > 200 ? line.slice(0, 197) + '…' : line;
}

/**
 * Garante o container isolado onde o mermaid desenha. Fica fora da tela, mas
 * precisa de largura real: diagramas como gantt e timeline medem o container
 * pai ao desenhar e, com 1 px, saem com viewBox de 1 px e barras negativas.
 * Não usar display:none nem visibility:hidden, que anulam getBBox().
 */
export function ensureSandbox(document, width = DEFAULT_WIDTH) {
  let box = document.getElementById(SANDBOX_ID);
  if (!box) {
    box = document.createElement('div');
    box.id = SANDBOX_ID;
    box.setAttribute('aria-hidden', 'true');
    document.body.appendChild(box);
  }
  const w = Math.max(200, Math.round(Number(width) || DEFAULT_WIDTH));
  box.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:auto;overflow:visible;opacity:0;pointer-events:none;`;
  return box;
}

/** Largura útil de um elemento (sem padding), ou o padrão se não houver layout. */
export function usableWidth(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return DEFAULT_WIDTH;
  const rect = el.getBoundingClientRect();
  let pad = 0;
  try {
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  } catch { /* sem estilo computado */ }
  const w = rect.width - pad;
  return w > 50 ? w : DEFAULT_WIDTH;
}

/**
 * Remove resíduos que o mermaid possa ter deixado no documento: o container
 * isolado é esvaziado e os elementos temporários "d<id>" (div) e "i<id>"
 * (iframe) são removidos de onde estiverem. O SVG final tem id igual a <id>
 * e fica no bloco de destino, por isso nunca é tocado aqui.
 */
export function cleanupMermaid(document, id) {
  const box = document.getElementById(SANDBOX_ID);
  if (box) box.innerHTML = '';
  if (!id) return;
  for (const sel of ['d' + id, 'i' + id]) {
    const el = document.getElementById(sel);
    if (el) el.remove();
  }
}

/**
 * Substitui o conteúdo do bloco por um aviso de erro com o código-fonte.
 * O atributo data-src é mantido para a conversão HTML -> Markdown.
 */
export function showMermaidError(document, el, src, message) {
  el.innerHTML = '';
  el.classList.add(ERROR_CLASS);
  el.setAttribute('data-src', src);
  const head = document.createElement('div');
  head.className = 'mermaid-error-title';
  head.textContent = 'Diagrama Mermaid inválido: ' + message;
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = 'language-mermaid';
  code.textContent = src;
  pre.appendChild(code);
  el.append(head, pre);
}

/** Promise com limite de tempo. */
export function withTimeout(promise, ms, label = 'operação') {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu ${ms} ms`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/**
 * Renderiza todos os <div class="mermaid"> dentro de `root`, um por vez.
 * Nunca lança: cada bloco acaba como SVG ou como aviso de erro.
 *
 * @param {Element} root
 * @param {object} opts
 * @param {object} opts.mermaid          instância do mermaid (parse/render)
 * @param {Document} opts.document
 * @param {() => boolean} [opts.isStale] se devolver true, a renderização é abandonada
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.width]       largura disponível para o diagrama (padrão: a de root)
 * @param {string} [opts.idPrefix]
 * @returns {Promise<{rendered:number, failed:number, aborted:boolean}>}
 */
export async function renderMermaidBlocks(root, opts) {
  const { mermaid, document, isStale = () => false, timeoutMs = DEFAULT_TIMEOUT_MS, idPrefix = 'mmd' } = opts;
  const result = { rendered: 0, failed: 0, aborted: false };
  const nodes = [...root.querySelectorAll('.mermaid')];
  if (!nodes.length) return result;
  const sandbox = ensureSandbox(document, opts.width ?? usableWidth(root));
  let seq = 0;

  for (const el of nodes) {
    if (isStale()) { result.aborted = true; break; }
    const src = (el.getAttribute('data-src') ?? el.textContent ?? '').trim();
    el.setAttribute('contenteditable', 'false');
    if (!src) { showMermaidError(document, el, src, 'bloco vazio'); result.failed++; continue; }
    const id = `${idPrefix}-${Date.now().toString(36)}-${seq++}`;
    try {
      const ok = await withTimeout(Promise.resolve(mermaid.parse(src, { suppressErrors: true })), timeoutMs, 'validação do diagrama');
      if (ok === false) throw new Error(await explainParseError(mermaid, src));
      const out = await withTimeout(Promise.resolve(mermaid.render(id, src, sandbox)), timeoutMs, 'desenho do diagrama');
      const svg = out && typeof out.svg === 'string' ? out.svg : '';
      if (!svg) throw new Error('o mermaid não devolveu SVG');
      if (isStale()) { result.aborted = true; break; }
      el.innerHTML = svg;
      el.classList.remove(ERROR_CLASS);
      result.rendered++;
    } catch (err) {
      showMermaidError(document, el, src, describeRenderError(err));
      result.failed++;
    } finally {
      cleanupMermaid(document, id);
    }
  }
  return result;
}

/** Repete o parse sem supressão só para obter a mensagem de erro do mermaid. */
async function explainParseError(mermaid, src) {
  try {
    await mermaid.parse(src, { suppressErrors: false });
    return 'erro de sintaxe';
  } catch (err) {
    return describeRenderError(err);
  }
}
