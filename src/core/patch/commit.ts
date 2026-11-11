import {
  HTML_NAMESPACE,
  MATHML_NAMESPACE,
  SVG_NAMESPACE,
  childNamespace,
  createDom,
  isEventProp,
  isEventPropName,
  removeEvent,
  setEvent,
  toEventType,
} from '../vnode-to-dom';
import type { Namespace } from '../vnode-to-dom';
import { syncFormProp } from './formProps';
import type { ResolvedPatch } from './resolve';

/** 부모 DOM 요소 아래에 새로 만들 노드의 네임스페이스. SVG 안에 추가되는 요소가 그려지게 한다. */
function namespaceForChildrenOf(parent: Element): Namespace {
  const own: Namespace =
    parent.namespaceURI === SVG_NAMESPACE
      ? SVG_NAMESPACE
      : parent.namespaceURI === MATHML_NAMESPACE
        ? MATHML_NAMESPACE
        : HTML_NAMESPACE;
  return childNamespace(own, parent.localName);
}

/** 텍스트처럼 요소가 아닌 노드의 변경은 그 부모 요소를 변경된 요소로 본다. */
function changedElement(node: Node, parent: Element | null): Element | null {
  return node instanceof Element ? node : parent;
}

/** 찾아 둔 대상에 Patch 하나를 반영하고 변경된 요소를 돌려준다. */
export function commit({ patch, target }: ResolvedPatch): Element | null {
  switch (patch.type) {
    case 'CREATE': {
      // 인덱스 기반 diff에서 CREATE는 항상 자식 목록 끝에 생긴다.
      const parent = target as Element;
      const node = createDom(patch.node, namespaceForChildrenOf(parent));
      parent.appendChild(node);
      return changedElement(node, parent);
    }
    case 'REMOVE': {
      const parent = target.parentElement;
      (target as ChildNode).remove();
      return parent;
    }
    case 'REPLACE': {
      const parent = target.parentElement;
      const namespace = parent ? namespaceForChildrenOf(parent) : HTML_NAMESPACE;
      const node = createDom(patch.node, namespace);
      (target as ChildNode).replaceWith(node);
      return changedElement(node, parent);
    }
    case 'TEXT': {
      // 텍스트 노드를 새로 만들지 않고 내용만 바꾼다.
      target.nodeValue = patch.text;
      return target.parentElement;
    }
    case 'PROPS': {
      const element = target as Element;
      for (const [name, value] of Object.entries(patch.set)) {
        // 이벤트는 표의 함수만 바꾼다. addEventListener는 종류마다 처음 한 번만 한다.
        if (isEventProp(name, value)) {
          setEvent(element, toEventType(name), value);
        } else if (typeof value === 'string') {
          element.setAttribute(name, value);
          syncFormProp(element, name, value);
        }
      }
      for (const name of patch.remove) {
        if (isEventPropName(name)) {
          removeEvent(element, toEventType(name));
        } else {
          element.removeAttribute(name);
          syncFormProp(element, name, null);
        }
      }
      return element;
    }
  }
}
