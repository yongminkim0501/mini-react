import { freezeNode } from './freeze';
import { isBlockedTag, isDangerousUrl, isEventAttr, isUrlAttr } from './sanitize';
import { normalizeClass, normalizeText } from './text';
import type { ConvertWarning, VElement, VNode, WarningCode, WarningSeverity } from './types';

const PRESERVE_WHITESPACE_TAGS = new Set(['pre', 'textarea']);

const SEVERITY: Record<WarningCode, WarningSeverity> = {
  INPUT_TOO_LARGE: 'error',
  SANITIZED_ELEMENT: 'warn',
  SANITIZED_ATTR: 'warn',
  DUPLICATE_KEY: 'warn',
};

export function createWarning(
  code: WarningCode,
  path: readonly number[],
  detail: string,
): ConvertWarning {
  return Object.freeze({ severity: SEVERITY[code], code, path: Object.freeze([...path]), detail });
}

/**
 * 자식 노드를 VNode 배열로 바꾼다 (4, 7단계).
 * 텍스트는 모아두었다가 요소를 만나거나 형제가 끝날 때 한 번에 정리한다.
 * 주석이나 차단된 요소는 텍스트를 끊지 않으므로 `안녕<!-- -->세상`이 하나로 합쳐진다.
 */
export function convertChildren(
  parent: Node,
  path: readonly number[],
  warnings: ConvertWarning[],
  preserveWhitespace: boolean,
): VNode[] {
  const children: VNode[] = [];
  const seenKeys = new Set<string>();
  let pendingText = '';

  const flushText = (): void => {
    const text = normalizeText(pendingText, preserveWhitespace);
    pendingText = '';
    if (text !== null) children.push(freezeNode({ kind: 'text', text }));
  };

  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      pendingText += (node as Text).data;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const element = node as Element;
    if (isBlockedTag(element.localName)) {
      warnings.push(
        createWarning('SANITIZED_ELEMENT', [...path, children.length], `<${element.localName}> 제거`),
      );
      continue;
    }

    flushText();
    const childPath = [...path, children.length];
    const vnode = convertElement(element, childPath, warnings, preserveWhitespace);
    if (vnode.key !== undefined) {
      if (seenKeys.has(vnode.key)) {
        warnings.push(createWarning('DUPLICATE_KEY', childPath, `data-key="${vnode.key}" 중복`));
      }
      seenKeys.add(vnode.key);
    }
    children.push(vnode);
  }
  flushText();

  return children;
}

/** 허용된 요소를 VNode로 바꾼다 (5단계). 차단 여부는 호출하는 쪽에서 먼저 판정한다. */
export function convertElement(
  element: Element,
  path: readonly number[],
  warnings: ConvertWarning[],
  inheritedPreserve: boolean,
): VElement {
  // tagName은 대문자이고, 소문자로 바꾸면 SVG의 linearGradient 같은 태그가 깨진다.
  const tag = element.localName;
  const { props, key } = collectProps(element, path, warnings);
  const preserve = inheritedPreserve || PRESERVE_WHITESPACE_TAGS.has(tag);
  const children = convertChildren(element, path, warnings, preserve);

  const vnode: VElement =
    key === undefined
      ? { kind: 'element', tag, props, children }
      : { kind: 'element', tag, props, children, key };
  return freezeNode(vnode);
}

/** 속성 처리 (6단계): 이벤트 속성·위험 링크 제거, class 공백 정리, data-key 추출. */
export function collectProps(
  element: Element,
  path: readonly number[],
  warnings: ConvertWarning[],
): { props: Record<string, string>; key?: string } {
  // 속성 이름이 __proto__여도 일반 키로 저장되도록 프로토타입 없는 객체를 쓴다.
  const props: Record<string, string> = Object.create(null);
  let key: string | undefined;

  for (const { name, value } of Array.from(element.attributes)) {
    if (isEventAttr(name)) {
      warnings.push(createWarning('SANITIZED_ATTR', path, `${name} 속성 제거`));
      continue;
    }
    if (isUrlAttr(name) && isDangerousUrl(value)) {
      warnings.push(createWarning('SANITIZED_ATTR', path, `${name}의 javascript: 링크 제거`));
      continue;
    }
    if (name === 'data-key') key = value;
    props[name] = name === 'class' ? normalizeClass(value) : value;
  }

  return key === undefined ? { props } : { props, key };
}
