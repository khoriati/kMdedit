// test/dom.mjs — contexto de testes: expor DOMParser + instanciar DOMPurify p/ node
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';

const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
// jsdom nao expoe DOMParser global; injeta para o DOMPurify funcionar no node.
dom.window.DOMParser = dom.window.DOMParser ||
  (class {
    parseFromString(str) {
      const d = new JSDOM(str);
      return d.window.document;
    }
  });
if (!dom.window.DOMParser) {
  dom.window.DOMParser = class {
    parseFromString(str) { return new JSDOM(str).window.document; }
  };
}

const purify = createDOMPurify(dom.window);
const doc = dom.window.document;
const parse = (md) => marked.parse(md, { async: false });

export const ctx = { parse, purify, document: doc };
export { dom, purify, doc };
