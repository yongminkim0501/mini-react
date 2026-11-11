// vdom.js — Virtual DOM 표현과 변환
//   실제 DOM  --domToVNode-->  VNode
//   VNode     --createDom-->   실제 DOM
//   VNode     --toHTML-->      HTML 문자열 (Phase 1 편집 영역 표시용)

export const TEXT = 'text';
export const ELEMENT = 'element';
export const COMPONENT = 'component';

// 편집 영역에서 들어온 HTML이라도 실행되면 안 되는 태그
const BLOCKED_TAGS = new Set(['script', 'iframe', 'object', 'embed']);
// attribute가 아니라 DOM property로 반영해야 화면에 바로 보이는 키
const BOOLEAN_PROPS = new Set(['checked', 'selected', 'disabled']);
// 닫는 태그가 없는 요소
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'source', 'wbr']);

// ---------- VNode 생성 ----------

export function textNode(text) {
  return { type: TEXT, text: String(text) };
}

// h('div', { id: 'a' }, '안녕', h('b', null, '!'))
// h(Child, { count })  -> 컴포넌트 VNode (FunctionComponent가 나중에 펼침)
export function h(tag, props, ...children) {
  const normalized = normalizeChildren(children);
  if (typeof tag === 'function') {
    return { type: COMPONENT, fn: tag, props: { ...(props || {}), children: normalized } };
  }
  return { type: ELEMENT, tag, props: props || {}, children: normalized };
}

function normalizeChildren(children) {
  const result = [];
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || typeof child === 'boolean') continue; // {cond && h(...)} 지원
    result.push(typeof child === 'object' ? child : textNode(child)); // 문자열/숫자 -> 텍스트 VNode
  }
  return result;
}

// ---------- 실제 DOM -> VNode ----------

export function domToVNode(node) {
  if (node.nodeType === 3) return textNode(node.nodeValue); // 3 = TEXT_NODE
  if (node.nodeType !== 1) return null; // 주석 등은 무시 (1 = ELEMENT_NODE)

  const tag = node.tagName.toLowerCase();
  if (BLOCKED_TAGS.has(tag)) return null;

  const props = {};
  for (const attr of node.attributes) {
    if (isUnsafeAttr(attr.name, attr.value)) continue;
    props[attr.name] = attr.value;
  }
  return { type: ELEMENT, tag, props, children: childrenToVNodes(node) };
}

export function childrenToVNodes(parent) {
  const children = [];
  for (const child of parent.childNodes) {
    // 들여쓰기·줄바꿈만 있는 텍스트 노드는 버린다 -> VNode 인덱스 == DOM childNodes 인덱스
    if (child.nodeType === 3 && child.nodeValue.trim() === '') continue;
    const vnode = domToVNode(child);
    if (vnode) children.push(vnode);
  }
  return children;
}

// HTML 문자열 -> VNode 배열. <template> 안에서 파싱된 스크립트는 실행되지 않는다.
export function htmlToVNodes(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return childrenToVNodes(template.content);
}

function isUnsafeAttr(name, value) {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return true; // onclick="..." 같은 인라인 핸들러
  if ((lower === 'href' || lower === 'src') && /^\s*javascript:/i.test(value)) return true;
  return false;
}

// ---------- VNode -> 실제 DOM ----------

export function createDom(vnode) {
  if (vnode.type === TEXT) return document.createTextNode(vnode.text);
  if (vnode.type === COMPONENT) throw new Error('컴포넌트 VNode는 FunctionComponent가 먼저 펼쳐야 합니다.');

  const el = document.createElement(vnode.tag);
  for (const child of vnode.children) el.appendChild(createDom(child));
  // 자식을 먼저 붙이고 props를 설정한다 (<select value>는 option이 있어야 반영됨)
  for (const [key, value] of Object.entries(vnode.props)) setProp(el, key, value);
  return el;
}

// 속성 하나를 실제 DOM에 반영한다. (createDom과 patch가 함께 사용)
export function setProp(el, key, value) {
  if (key.startsWith('on') && typeof value === 'function') {
    // onClick -> 'click'. 이전 리스너를 지우고 새 리스너를 건다 (리스너 누적 방지)
    const eventName = key.slice(2).toLowerCase();
    const listeners = el.__listeners || (el.__listeners = {});
    if (listeners[eventName]) el.removeEventListener(eventName, listeners[eventName]);
    listeners[eventName] = value;
    el.addEventListener(eventName, value);
    return;
  }
  if (key === 'value') {
    const str = value === null || value === undefined ? '' : String(value);
    el.setAttribute('value', str);          // HTML attribute (초기값, outerHTML에 보임)
    if (el.value !== str) el.value = str;   // DOM property (화면에 실제로 보이는 값). 같으면 건드리지 않아 커서 유지
    return;
  }
  if (BOOLEAN_PROPS.has(key)) {
    const on = value !== false && value !== null && value !== undefined; // HTML: checked="" 도 true
    el[key] = on;
    if (on) el.setAttribute(key, '');
    else el.removeAttribute(key);
    return;
  }
  el.setAttribute(key, value);
}

export function removeProp(el, key, oldValue) {
  if (key.startsWith('on') && typeof oldValue === 'function') {
    const eventName = key.slice(2).toLowerCase();
    if (el.__listeners?.[eventName]) {
      el.removeEventListener(eventName, el.__listeners[eventName]);
      delete el.__listeners[eventName];
    }
    return;
  }
  if (key === 'value') el.value = '';
  if (BOOLEAN_PROPS.has(key)) el[key] = false;
  el.removeAttribute(key);
}

// ---------- VNode -> HTML 문자열 (Phase 1 편집 영역) ----------

export function toHTML(vnode, indent = '') {
  if (vnode.type === TEXT) return indent + escapeText(vnode.text);

  const attrs = Object.entries(vnode.props)
    .filter(([, v]) => typeof v !== 'function')
    .map(([k, v]) => (v === true || (BOOLEAN_PROPS.has(k) && v === '') ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`))
    .join('');
  const open = `${indent}<${vnode.tag}${attrs}>`;
  if (VOID_TAGS.has(vnode.tag)) return open;
  if (vnode.children.length === 0) return `${open}</${vnode.tag}>`;

  // 자식이 모두 요소일 때만 줄바꿈·들여쓰기. 텍스트가 섞이면 한 줄로 써서 텍스트 내용이 바뀌지 않게 한다.
  const allElements = vnode.children.every((c) => c.type === ELEMENT);
  if (!allElements) {
    return `${open}${vnode.children.map((c) => toHTML(c, '')).join('')}</${vnode.tag}>`;
  }
  const inner = vnode.children.map((c) => toHTML(c, indent + '  ')).join('\n');
  return `${open}\n${inner}\n${indent}</${vnode.tag}>`;
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
