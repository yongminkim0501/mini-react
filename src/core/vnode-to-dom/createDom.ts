import { ROOT_TAG } from '../html-to-vnode';
import type { VElement, VNode, VText } from '../html-to-vnode';
import { isEventProp, setEvent, toEventType } from './events';
import { HTML_NAMESPACE, childNamespace, elementNamespace } from './namespace';
import type { Namespace } from './namespace';

/**
 * VNode를 DOM 노드로 만든다. innerHTML 없이 DOM API만 쓰고 VNode는 읽기만 한다.
 * 보안 필터는 다시 적용하지 않는다. 입력은 fromDom / fromHtml에서 이미 걸러진 VNode다.
 */
export function createDom(vnode: VText, namespace?: Namespace): Text;
export function createDom(vnode: VElement, namespace?: Namespace): Element | DocumentFragment;
export function createDom(vnode: VNode, namespace?: Namespace): Node;
export function createDom(vnode: VNode, namespace: Namespace = HTML_NAMESPACE): Node {
  // 텍스트는 글자로만 들어가므로 '<script>'여도 실행되지 않는다.
  if (vnode.kind === 'text') return document.createTextNode(vnode.text);

  // 최상위 노드가 여러 개여도 한 번에 붙일 수 있도록 #root는 프래그먼트로 만든다.
  if (vnode.tag === ROOT_TAG) {
    const fragment = document.createDocumentFragment();
    appendChildren(fragment, vnode.children, namespace);
    return fragment;
  }

  // SVG·MathML 요소를 createElement로 만들면 화면에 그려지지 않는다.
  const ownNamespace = elementNamespace(namespace, vnode.tag);
  const element =
    ownNamespace === HTML_NAMESPACE
      ? document.createElement(vnode.tag)
      : document.createElementNS(ownNamespace, vnode.tag);

  // key는 props['data-key']에 이미 들어 있으므로 따로 출력하지 않는다.
  for (const [name, value] of Object.entries(vnode.props)) {
    // 이벤트 함수는 속성이 아니라 이벤트 표에 넣는다 (Phase 2).
    if (isEventProp(name, value)) setEvent(element, toEventType(name), value);
    else if (typeof value === 'string') element.setAttribute(name, value);
  }

  appendChildren(element, vnode.children, childNamespace(namespace, vnode.tag));
  return element;
}

/** 화면에 붙기 전에 서브트리를 완성해 레이아웃 계산이 마지막에 한 번만 일어나게 한다. */
function appendChildren(parent: Node, children: readonly VNode[], namespace: Namespace): void {
  for (const child of children) {
    parent.appendChild(createDom(child, namespace));
  }
}
