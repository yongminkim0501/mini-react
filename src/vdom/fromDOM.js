/**
 * 실제 DOM  →  Virtual DOM 변환.
 *
 * 옵션
 *   ignoreWhitespace (기본 true)  요소 사이의 "줄바꿈을 포함한 공백뿐인 텍스트"(들여쓰기)를 버린다.
 *                                 줄바꿈 없는 공백(`<b>a</b> <i>b</i>` 사이의 띄어쓰기)은 유지한다.
 *                                 <pre>, <textarea>, <script>, <style> 안에서는 공백이 의미가 있으므로 모두 유지.
 *   keepComments     (기본 false) 주석 노드를 VNode 로 남긴다. 끄면 주석은 없는 것으로 취급.
 *   sanitize         (기본 true)  <script>, on* 속성, javascript: URL 등을 제거한다.
 *   liveState        (기본 true)  폼 요소의 "현재 값"을 읽는다.
 *                                 사용자가 입력창에 타이핑하거나 체크박스를 누르면 브라우저는 HTML 속성(attribute)이
 *                                 아니라 프로퍼티(property)만 바꾼다. 속성만 읽으면 그 변경이 Diff 에 보이지 않는다.
 *                                   <input>  value / checked   <textarea> 내용   <option> selected
 */

import { COMMENT, ELEMENT, NS_HTML, comment, element, fragment, text } from './vnode.js';
import { BLOCKED_TAGS, isSafeAttribute } from './safety.js';

const PRESERVE_WHITESPACE = new Set(['pre', 'textarea', 'script', 'style']);
const DEFAULTS = { ignoreWhitespace: true, keepComments: false, sanitize: true, liveState: true };

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;
const FRAGMENT_NODE = 11;

/** DOM 노드 하나를 VNode 로 변환한다. 변환 대상이 아니면(처리 명령 등) null. */
export function domToVNode(node, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  switch (node.nodeType) {
    case ELEMENT_NODE:
      return convertElement(node, opts, false);
    case TEXT_NODE:
    case CDATA_NODE:
      return node.nodeValue === '' ? null : text(node.nodeValue);
    case COMMENT_NODE:
      return opts.keepComments ? comment(node.nodeValue) : null;
    case DOCUMENT_NODE:
      return node.documentElement ? convertElement(node.documentElement, opts, false) : null;
    case FRAGMENT_NODE:
      return fragment(convertChildren(node.childNodes, opts, false));
    default:
      return null;
  }
}

/**
 * 컨테이너(영역)의 "내용물"을 fragment VNode 로 변환한다.
 * 컨테이너 자신의 id/class 는 비교 대상이 아니므로 포함하지 않는다.
 */
export function containerToVNode(container, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const preserve = PRESERVE_WHITESPACE.has(container.localName);
  return fragment(convertChildren(childNodesOf(container), opts, preserve));
}

/** HTML 문자열 → fragment VNode. <template> 으로 파싱하므로 이미지 로딩·스크립트 실행이 일어나지 않는다. */
export function htmlToVNode(html, options = {}, doc = globalThis.document) {
  const template = doc.createElement('template');
  template.innerHTML = html;
  return domToVNode(template.content, options);
}

/**
 * 코드를 보기 좋게 정렬하느라 들어간 공백인가? "공백뿐이고 줄바꿈을 포함"하면 그렇다고 본다.
 * 줄바꿈 없는 단일 공백(`<b>a</b> <i>b</i>` 의 사이)은 화면에 보이는 띄어쓰기이므로 보존한다.
 * (한계: 인라인 요소 사이에 줄바꿈이 있으면 브라우저는 그것도 공백 하나로 그리지만 여기서는 버린다.
 *  CSS 까지 고려해야 정확히 구분할 수 있어서, 정렬용 공백 제거를 우선하는 단순한 규칙을 택했다.)
 */
function isFormattingWhitespace(s) {
  return s.trim() === '' && /[\r\n]/.test(s);
}

function childNodesOf(el) {
  return el.localName === 'template' && el.content ? el.content.childNodes : el.childNodes;
}

function convertElement(el, opts, parentPreserve) {
  const tag = el.localName;
  if (opts.sanitize && BLOCKED_TAGS.has(tag)) return null;

  const props = {};
  for (const attr of el.attributes) {
    if (!opts.sanitize || isSafeAttribute(attr.name, attr.value)) props[attr.name] = attr.value;
  }

  const preserve = parentPreserve || PRESERVE_WHITESPACE.has(tag);
  let children = convertChildren(childNodesOf(el), opts, preserve);

  if (opts.liveState && el.namespaceURI === NS_HTML) {
    children = readLiveState(el, tag, props, children);
  }
  return element(tag, props, children, el.namespaceURI === NS_HTML ? undefined : el.namespaceURI);
}

/**
 * 폼 요소의 현재 상태(property)를 VNode 의 props/children 에 반영한다.
 * props 는 제자리에서 수정하고, 바뀐 children 을 돌려준다.
 */
function readLiveState(el, tag, props, children) {
  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (el.checked) props.checked = '';
      else delete props.checked;
    } else if (type !== 'file') {
      // file 의 value 는 보안상 가짜 경로이고 설정할 수도 없다
      if (el.value !== '') props.value = el.value;
      else delete props.value;
    }
  } else if (tag === 'textarea') {
    // 편집 전에는 value 가 자식 텍스트와 같고, 편집 후에는 value 만 바뀐다
    return el.value === '' ? [] : [text(el.value)];
  } else if (tag === 'option') {
    if (el.selected) props.selected = '';
    else delete props.selected;
  }
  return children;
}

/**
 * 자식 변환. 인접한 텍스트 노드(사이에 무시되는 주석이 끼어 있어도)는 먼저 합친 뒤에
 * "공백뿐인가?"를 판단한다. 그래야 "a<!-- -->  " 같은 경우에 내용이 잘리지 않는다.
 */
function convertChildren(nodeList, opts, preserve) {
  const out = [];
  let buffer = '';

  const flush = () => {
    if (buffer !== '' && !(opts.ignoreWhitespace && !preserve && isFormattingWhitespace(buffer))) {
      out.push(text(buffer));
    }
    buffer = '';
  };

  for (const child of nodeList) {
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_NODE) {
      buffer += child.nodeValue;
      continue;
    }
    if (child.nodeType === COMMENT_NODE && !opts.keepComments) continue; // 텍스트 흐름을 끊지 않는다
    if (child.nodeType === COMMENT_NODE) {
      flush();
      out.push(comment(child.nodeValue));
      continue;
    }
    if (child.nodeType === ELEMENT_NODE) {
      const converted = convertElement(child, opts, preserve);
      if (converted) {
        flush();
        out.push(converted);
      }
    }
  }
  flush();
  return out;
}

export { COMMENT, ELEMENT };
