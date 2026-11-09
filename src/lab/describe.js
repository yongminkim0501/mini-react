/**
 * diff 결과(op)를 사람이 읽을 수 있는 한 줄로 설명한다. (검증 페이지의 "Diff 결과" 패널용)
 */

import { OP } from '../vdom/diff.js';

const LABELS = {
  [OP.CREATE]: '추가',
  [OP.REMOVE]: '삭제',
  [OP.REPLACE]: '교체',
  [OP.TEXT]: '텍스트',
  [OP.PROPS]: '속성',
  [OP.MOVE]: '이동',
};

export const opLabel = (op) => LABELS[op.type] ?? op.type;

const clip = (s, n = 18) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** VNode 한 개를 짧게 표현: <div#id.class>, "텍스트" */
export function nodeLabel(v) {
  if (!v) return '(없음)';
  switch (v.type) {
    case 'text': return `"${clip(v.value.replace(/\s+/g, ' '))}"`;
    case 'comment': return `<!-- ${clip(v.value.trim())} -->`;
    case 'fragment': return '(루트)';
    default: {
      const id = v.props.id ? `#${v.props.id}` : '';
      const cls = v.props.class ? `.${v.props.class.trim().split(/\s+/)[0]}` : '';
      const key = v.props.key !== undefined ? `[key=${v.props.key}]` : '';
      return `<${v.tag}${id}${cls}${key}>`;
    }
  }
}

/** path 를 따라 VNode 를 찾는다. 찾지 못하면 null. */
export function vnodeAt(tree, path) {
  let node = tree;
  for (const i of path) {
    node = node?.children?.[i];
    if (!node) return null;
  }
  return node;
}

/** 루트에서 해당 노드까지의 경로를 `div > ul > li` 처럼 보여준다. */
export function pathLabel(tree, path) {
  if (path.length === 0) return '(루트)';
  const parts = [];
  let node = tree;
  for (const i of path) {
    node = node?.children?.[i];
    parts.push(node ? nodeLabel(node) : `#${i}`);
  }
  return parts.join(' › ');
}

/**
 * @param {object} op
 * @param {object} oldTree op 의 path 가 가리키는 "이전" VNode 트리
 */
export function describeOp(op, oldTree) {
  switch (op.type) {
    case OP.CREATE:
      return `${pathLabel(oldTree, op.parentPath)} 의 ${op.index}번째에 ${nodeLabel(op.node)} 추가`;
    case OP.REMOVE:
      return `${pathLabel(oldTree, op.path)} 삭제`;
    case OP.REPLACE:
      return `${pathLabel(oldTree, op.path)} → ${nodeLabel(op.node)} 로 교체`;
    case OP.TEXT: {
      const before = vnodeAt(oldTree, op.path);
      return `${pathLabel(oldTree, op.path)}  ${nodeLabel(before)} → ${nodeLabel({ type: 'text', value: op.value })}`;
    }
    case OP.PROPS: {
      const parts = [
        ...Object.entries(op.set).map(([k, v]) => `${k}="${clip(v, 24)}"`),
        ...op.remove.map((k) => `−${k}`),
      ];
      return `${pathLabel(oldTree, op.path)}  ${parts.join(', ')}`;
    }
    case OP.MOVE:
      return `${pathLabel(oldTree, op.path)} 를 ${op.index}번째로 이동`;
    default:
      return JSON.stringify(op);
  }
}
