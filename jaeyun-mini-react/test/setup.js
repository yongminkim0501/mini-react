// Node에는 DOM이 없으므로 jsdom으로 document/window를 전역에 만든다.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
