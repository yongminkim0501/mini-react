import { ROOT_TAG } from '../html-to-vnode';
import type { PropValue, VElement, VNode } from '../html-to-vnode';
import { escapeAttr, escapeText } from './escape';
import { isInlineLayout, isPreserve, isVoid } from './rules';

const INDENT = '  ';

/**
 * VNode를 들여쓰기 HTML 문자열로 바꾼다.
 * fromHtml(serialize(v)).vnode가 v와 같아야 한다 (왕복 불변식).
 * #root 자신은 출력하지 않고 자식만 같은 규칙으로 출력한다.
 */
export function serialize(vnode: VNode): string {
  if (vnode.kind === 'element' && vnode.tag === ROOT_TAG) {
    return serializeChildren(vnode, -1, isInlineLayout(vnode));
  }
  return serializeNode(vnode, 0, false);
}

export function serializeNode(vnode: VNode, depth: number, inline: boolean): string {
  if (vnode.kind === 'text') return escapeText(vnode.text);

  const open = `<${vnode.tag}${serializeAttrs(vnode.props)}>`;
  if (isVoid(vnode.tag)) return open;

  const childInline = inline || isPreserve(vnode.tag) || isInlineLayout(vnode);
  let inner = serializeChildren(vnode, depth, childInline);
  // 파서는 <pre>, <textarea> 바로 뒤의 첫 줄바꿈 하나를 버리므로 하나 더 넣어 둔다.
  if (isPreserve(vnode.tag) && inner.startsWith('\n')) inner = `\n${inner}`;
  return `${open}${inner}</${vnode.tag}>`;
}

/**
 * 인라인이면 자식을 한 줄에 이어 쓴다.
 * 블록이면 자식마다 줄을 바꾸고 한 단계 들여쓴다. 요소 사이의 줄바꿈은 다시 읽을 때 버려진다.
 * depth -1은 #root로, 자식을 들여쓰지 않고 앞뒤 줄바꿈도 넣지 않는다.
 */
function serializeChildren(element: VElement, depth: number, inline: boolean): string {
  const { children } = element;
  if (children.length === 0) return '';
  if (inline) return children.map((child) => serializeNode(child, depth + 1, true)).join('');

  const childIndent = INDENT.repeat(depth + 1);
  const lines = children.map((child) => childIndent + serializeNode(child, depth + 1, false));
  if (depth < 0) return lines.join('\n');
  return `\n${lines.join('\n')}\n${INDENT.repeat(depth)}`;
}

function serializeAttrs(props: Readonly<Record<string, PropValue>>): string {
  let result = '';
  for (const [name, value] of Object.entries(props)) {
    // 이벤트 함수는 HTML로 나타낼 수 없으므로 출력하지 않는다.
    if (typeof value !== 'string') continue;
    result += value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
  }
  return result;
}
