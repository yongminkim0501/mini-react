import type { Patch, Path } from '../core/diff';
import type { PropValue, VNode } from '../core/html-to-vnode';
import { escapeAttr } from '../core/vnode-to-html';
import type { View } from './view';

function formatPath(path: Path): string {
  return `[${path.join(',')}]`;
}

/** 속성은 name="값", 이벤트 함수는 name=ƒ로 표시한다. */
function formatProp(name: string, value: PropValue): string {
  return typeof value === 'string' ? `${name}="${escapeAttr(value)}"` : `${name}=ƒ`;
}

/** 새로 만들 노드를 짧게 표시한다. 요소는 여는 태그, 텍스트는 따옴표로 감싼 내용. */
function describeNode(node: VNode): string {
  if (node.kind === 'text') return JSON.stringify(node.text);
  const attrs = Object.entries(node.props)
    .map(([name, value]) => ` ${formatProp(name, value)}`)
    .join('');
  return `<${node.tag}${attrs}>`;
}

/** 6장 형식으로 Patch 한 건을 로그 문장으로 만든다. */
export function formatPatch(patch: Patch): string {
  switch (patch.type) {
    case 'PROPS': {
      const set = Object.entries(patch.set).map(([name, value]) => formatProp(name, value));
      const remove = patch.remove.map((name) => `-${name}`);
      return `PROPS ${formatPath(patch.path)} ${[...set, ...remove].join(' ')}`;
    }
    case 'TEXT':
      return `TEXT ${formatPath(patch.path)} ${JSON.stringify(patch.text)}`;
    case 'CREATE':
      return `CREATE ${formatPath(patch.parentPath)} ${patch.index + 1}번째에 ${describeNode(patch.node)}`;
    case 'REMOVE':
      return `REMOVE ${formatPath(patch.path)}`;
    case 'REPLACE':
      return `REPLACE ${formatPath(patch.path)} → ${describeNode(patch.node)}`;
  }
}

/** 마지막 동작의 Patch 목록과 건수를 표시한다. 빈 배열이면 로그를 비운다. */
export function showPatchLog(view: View, patches: readonly Patch[]): void {
  const doc = view.log.ownerDocument;
  view.log.replaceChildren(
    ...patches.map((patch) => {
      const li = doc.createElement('li');
      li.textContent = formatPatch(patch);
      return li;
    }),
  );
  view.count.textContent = patches.length > 0 ? `Patch ${patches.length}건` : '';
}

const FLASH: Keyframe[] = [{ backgroundColor: 'rgba(255, 214, 0, 0.75)' }, { backgroundColor: 'transparent' }];

/**
 * 변경된 요소의 배경을 잠깐 깜빡인다.
 * class·style을 건드리지 않는 Web Animations를 써서 실제 영역 DOM과 VNode의 일치를 유지한다.
 */
export function highlight(elements: readonly Element[]): void {
  for (const element of new Set(elements)) {
    if (!element.isConnected || typeof element.animate !== 'function') continue;
    element.animate(FLASH, { duration: 900, easing: 'ease-out' });
  }
}
