import type { VElement } from '../html-to-vnode';

const VOID_TAGS = new Set([
  'area',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const PRESERVE_TAGS = new Set(['pre', 'textarea', 'listing', 'plaintext']);

/** 닫는 태그를 쓰지 않는 요소 */
export function isVoid(tag: string): boolean {
  return VOID_TAGS.has(tag);
}

/** 공백을 그대로 보존해야 하는 요소. 자식을 인라인으로, 들여쓰기 없이 쓴다. */
export function isPreserve(tag: string): boolean {
  return PRESERVE_TAGS.has(tag);
}

/**
 * 텍스트 자식이 하나라도 있으면 인라인으로 쓴다.
 * 텍스트 옆에 줄바꿈을 넣으면 다시 읽을 때 의미 있는 공백이 사라진다.
 */
export function isInlineLayout(element: VElement): boolean {
  return element.children.some((child) => child.kind === 'text');
}
