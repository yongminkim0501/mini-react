import { JSDOM } from 'jsdom';

/**
 * 매 테스트마다 독립된 JSDOM 환경을 생성하고 전역 브라우저 심볼을 설정한다.
 */
export function setupDOM(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, {
    url: 'http://localhost:5173/',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.SVGElement = window.SVGElement;
  globalThis.MutationObserver = window.MutationObserver;
  return {
    dom,
    window,
    document: window.document,
    cleanup() {
      window.close();
    },
  };
}
