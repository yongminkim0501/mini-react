/**
 * Patch: diff 가 만든 변경 목록(ops)을 실제 DOM 에 적용한다.
 *
 * diff 의 모든 path 는 "변경 전 DOM" 기준이므로, 적용 순서를 다음과 같이 나눈다.
 *
 *   0단계  모든 op 의 대상 노드를 변경 전에 먼저 찾아 둔다 (노드 참조 확보)
 *   1단계  제자리 수정  : PROPS, TEXT, REPLACE      (구조가 안 바뀌므로 인덱스 영향 없음)
 *   2단계  분리         : REMOVE, MOVE 대상을 DOM 에서 떼어낸다
 *   3단계  삽입         : CREATE, MOVE 를 부모별로 "새 인덱스 오름차순" 으로 끼워 넣는다
 *
 * 3단계가 올바른 이유: 인덱스 i 를 넣는 시점에는 앞쪽 [0, i) 가 이미 최종 모습이고,
 * 그 뒤에는 움직이지 않는 노드들만 남아 있어서 childNodes[i] 앞에 끼우면 정확히 i 번째가 된다.
 */

import { OP } from './diff.js';
import { applyProps, createDOM } from './createDOM.js';

/**
 * @param {Node} root  path [] 에 해당하는 DOM (fragment VNode 의 경우 컨테이너 요소)
 * @param {Array} ops  diff() 의 결과
 * @param {{ onChange?: (node: Node, op: object) => void }} [options]
 *        onChange: 실제로 변경된 DOM 노드를 알려준다 (하이라이트 등에 사용)
 * @returns {Node} 패치 후의 루트 (루트 자체가 교체되었다면 새 노드)
 */
export function patch(root, ops, { onChange } = {}) {
  const doc = root.ownerDocument ?? root;
  const notify = (node, op) => onChange?.(node, op);

  // 0단계: 대상 찾기
  const resolved = ops.map((op) => ({
    op,
    target: op.path ? resolve(root, op.path) : null,
    parent: op.parentPath ? resolve(root, op.parentPath) : null,
  }));

  // 1단계: 제자리 수정
  let newRoot = root;
  for (const { op, target } of resolved) {
    if (op.type === OP.PROPS) {
      applyProps(target, op.set, op.remove);
      notify(target, op);
    } else if (op.type === OP.TEXT) {
      target.nodeValue = op.value;
      // <textarea> 는 사용자가 입력한 뒤에는 자식 텍스트가 화면 값에 반영되지 않는다
      if (target.parentNode?.localName === 'textarea') target.parentNode.value = op.value;
      notify(target, op);
    } else if (op.type === OP.REPLACE) {
      const fresh = createDOM(op.node, doc);
      if (target === root) newRoot = fresh;
      target.parentNode?.replaceChild(fresh, target);
      notify(fresh, op);
    }
  }

  // 2단계: 분리
  const touchedTextareas = new Set(); // 자식 텍스트가 바뀐 <textarea> (화면 값 value 를 따로 맞춰야 한다)
  for (const { op, target } of resolved) {
    if (op.type === OP.REMOVE) {
      const parent = target.parentNode;
      parent?.removeChild(target);
      if (parent) notify(parent, op);
      if (parent?.localName === 'textarea') touchedTextareas.add(parent);
    } else if (op.type === OP.MOVE) {
      target.parentNode?.removeChild(target);
    }
  }

  // 3단계: 삽입 (부모별, 새 인덱스 오름차순)
  const insertions = new Map(); // parent → [{ index, node, op }]
  for (const { op, target, parent } of resolved) {
    if (op.type !== OP.CREATE && op.type !== OP.MOVE) continue;
    const node = op.type === OP.CREATE ? createDOM(op.node, doc) : target;
    if (!insertions.has(parent)) insertions.set(parent, []);
    insertions.get(parent).push({ index: op.index, node, op });
  }
  for (const [parent, list] of insertions) {
    list.sort((a, b) => a.index - b.index);
    for (const { index, node, op } of list) {
      parent.insertBefore(node, parent.childNodes[index] ?? null);
      notify(node, op);
    }
    if (parent.localName === 'textarea') touchedTextareas.add(parent);
  }
  for (const textarea of touchedTextareas) textarea.value = textarea.textContent;

  return newRoot;
}

/** 루트에서 childNodes 인덱스를 따라 내려가 노드를 찾는다. */
function resolve(root, path) {
  let node = root;
  for (const index of path) {
    node = node.childNodes[index];
    if (!node) {
      throw new Error(`patch: 경로 [${path.join(', ')}] 에 해당하는 DOM 노드가 없습니다. (DOM 과 이전 VNode 가 어긋남)`);
    }
  }
  return node;
}
