/**
 * Virtual DOM  →  실제 DOM 생성, 그리고 속성 적용.
 */

import { COMMENT, ELEMENT, FRAGMENT, TEXT } from './vnode.js';
import { isSafeAttribute } from './safety.js';

/**
 * value 프로퍼티가 속성과 "따로 노는(dirty 상태가 있는)" input 타입인가?
 * checkbox/radio/hidden/버튼류는 value 프로퍼티가 속성을 그대로 반영(reflect)하므로, 프로퍼티에 값을 넣으면
 * 속성이 다시 생겨 버린다(예: 속성을 지운 뒤 value = '' 를 넣으면 value="" 속성이 되살아남). 이 타입들은 속성만 다룬다.
 */
const ATTRIBUTE_ONLY_VALUE_TYPES = new Set(['checkbox', 'radio', 'hidden', 'submit', 'reset', 'button', 'image', 'file']);
const hasDirtyValue = (el) => el.tagName === 'INPUT' && !ATTRIBUTE_ONLY_VALUE_TYPES.has((el.type || 'text').toLowerCase());

/** VNode 로 실제 DOM 노드(또는 fragment 의 경우 DocumentFragment)를 만든다. */
export function createDOM(vnode, doc = globalThis.document) {
  switch (vnode.type) {
    case TEXT:
      return doc.createTextNode(vnode.value);
    case COMMENT:
      return doc.createComment(vnode.value);
    case FRAGMENT: {
      const frag = doc.createDocumentFragment();
      for (const child of vnode.children) frag.appendChild(createDOM(child, doc));
      return frag;
    }
    case ELEMENT: {
      const el = vnode.ns ? doc.createElementNS(vnode.ns, vnode.tag) : doc.createElement(vnode.tag);
      applyProps(el, vnode.props, []);
      if (vnode.tag === 'script') el.setAttribute('type', 'text/plain'); // 방어: 실행되지 않게
      for (const child of vnode.children) el.appendChild(createDOM(child, doc));
      return el;
    }
    default:
      throw new TypeError(`알 수 없는 VNode 타입: ${vnode?.type}`);
  }
}

/** container 의 내용을 VNode 로 통째로 교체한다. (최초 렌더링 / 복구용. 일반 갱신은 diff + patch) */
export function render(vnode, container) {
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(createDOM(vnode, container.ownerDocument));
  return container;
}

/** el 에 속성을 설정(set)하고 제거(remove)한다. */
export function applyProps(el, set = {}, remove = []) {
  for (const name of remove) {
    el.removeAttribute(name);
    syncLiveProp(el, name, null);
  }
  // type 을 먼저 설정한다: value/checked 는 input 의 type 에 따라 해석이 달라진다
  const entries = Object.entries(set).sort(([a], [b]) => (a === 'type' ? -1 : b === 'type' ? 1 : 0));
  for (const [name, value] of entries) {
    if (!isSafeAttribute(name, value)) continue;
    el.setAttribute(name, value);
    syncLiveProp(el, name, value);
  }
}

/**
 * 사용자가 이미 입력창을 건드렸다면(dirty) value 속성을 바꿔도 화면 값이 안 바뀐다.
 * 그래서 attribute 와 함께 property 도 맞춰준다.
 */
function syncLiveProp(el, name, value) {
  if (name === 'value') {
    if (hasDirtyValue(el)) el.value = value ?? '';
  } else if (name === 'checked') {
    if (el.tagName === 'INPUT') el.checked = value !== null; // 속성이 있으면 true
  } else if (name === 'selected') {
    if (el.tagName === 'OPTION') el.selected = value !== null; // option.value 는 속성 반영이라 건드리지 않는다
  }
}
