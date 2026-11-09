/**
 * Diff: 이전 VNode 트리와 새 VNode 트리를 비교해 "변경 목록(ops)" 을 만든다.
 * DOM 을 전혀 건드리지 않는 순수 함수다.
 *
 * ─ 연산(op) 종류 ─────────────────────────────────────────────────────────────
 *   CREATE   { parentPath, index, node }   새 노드를 parent 의 index 위치에 삽입
 *   REMOVE   { path }                      노드 삭제
 *   REPLACE  { path, node }                노드를 통째로 교체 (태그/종류가 다름)
 *   TEXT     { path, value }               텍스트(주석) 내용 변경
 *   PROPS    { path, set, remove }         속성 추가·수정(set) / 삭제(remove)
 *   MOVE     { path, parentPath, index }   key 가 같은 노드를 새 위치로 이동 (과제 5가지 + 확장)
 *
 * ─ path ─────────────────────────────────────────────────────────────────────
 *   루트에서 childNodes 인덱스를 따라 내려가는 경로. [] = 루트, [2, 0] = 루트의 3번째 자식의 첫 자식.
 *   모든 path 는 "이전 트리" 기준이다. (patch 가 변경 전에 먼저 전부 찾아 두기 때문에
 *   앞선 삭제/삽입으로 인덱스가 밀리는 문제가 생기지 않는다)
 *
 * ─ 알고리즘의 가정 (React 와 동일한 휴리스틱) ───────────────────────────────────
 *   트리 편집 거리를 정확히 구하면 O(n³) 이라 현실적이지 않다. 그래서
 *   1) 종류/태그가 다르면 하위 트리를 비교하지 않고 통째로 교체한다.
 *   2) 같은 부모의 자식끼리만 비교한다. (key 가 있으면 key 로, 없으면 위치로 짝짓는다)
 *   → O(n)
 */

import { COMMENT, ELEMENT, FRAGMENT, TEXT, keyOf } from './vnode.js';
import { longestIncreasingSubsequence } from './lis.js';

export const OP = Object.freeze({
  CREATE: 'CREATE',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  TEXT: 'TEXT',
  PROPS: 'PROPS',
  MOVE: 'MOVE',
});

/** @returns {Array<object>} 변경 목록. 비어 있으면 두 트리는 동일하다. */
export function diff(oldTree, newTree) {
  if (!oldTree || !newTree) {
    throw new TypeError('diff 는 비교할 두 VNode 가 모두 필요합니다.');
  }
  const ops = [];
  walk(oldTree, newTree, [], ops);
  return ops;
}

/** 두 트리가 구조·내용 모두 같은가? */
export const isEqual = (a, b) => diff(a, b).length === 0;

/** 같은 "종류"의 노드인가? 같으면 안쪽을 비교해 갱신하고, 다르면 통째로 교체한다. */
function isSameKind(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === ELEMENT) return a.tag === b.tag && a.ns === b.ns;
  return true;
}

function walk(oldNode, newNode, path, ops) {
  if (!isSameKind(oldNode, newNode)) {
    ops.push({ type: OP.REPLACE, path, node: newNode });
    return;
  }
  switch (oldNode.type) {
    case TEXT:
    case COMMENT:
      if (oldNode.value !== newNode.value) ops.push({ type: OP.TEXT, path, value: newNode.value });
      return;
    case ELEMENT:
      diffProps(oldNode.props, newNode.props, path, ops);
      diffChildren(oldNode.children, newNode.children, path, ops);
      return;
    case FRAGMENT:
      diffChildren(oldNode.children, newNode.children, path, ops);
      return;
    default:
      throw new TypeError(`알 수 없는 VNode 타입: ${oldNode.type}`);
  }
}

function diffProps(oldProps, newProps, path, ops) {
  const set = {};
  const remove = [];
  for (const [name, value] of Object.entries(newProps)) {
    if (oldProps[name] !== value) set[name] = value;
  }
  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) remove.push(name);
  }
  if (remove.length || Object.keys(set).length) ops.push({ type: OP.PROPS, path, set, remove });
}

/**
 * 자식 목록 비교.
 *
 * 1) 짝짓기  : 새 자식마다 대응되는 이전 자식을 찾는다.
 *              key 가 있으면 같은 key, 없으면 같은 위치의 key 없는 자식.
 * 2) 짝이 없는 새 자식  → CREATE,  짝이 없는 이전 자식 → REMOVE
 * 3) 짝이 있는 쌍       → 재귀 비교. 단, 서로의 상대 순서가 바뀐 쌍은 MOVE.
 *                         "안 움직여도 되는 쌍"은 LIS 로 구해서 이동 횟수를 최소화한다.
 *
 * key 가 하나도 없으면 모든 쌍이 (i, i) 이므로 LIS 는 전체가 되고 MOVE 는 생기지 않는다.
 * 즉 위치 기반 비교는 이 알고리즘의 특수한 경우다.
 */
function diffChildren(oldChildren, newChildren, path, ops) {
  // key → 그 key 를 가진 이전 자식들의 인덱스 (앞에서부터 하나씩 소비).
  // key 가 중복되어도 같은 순서끼리 짝지으므로, 같은 트리를 비교하면 항상 변경이 없다.
  const oldIndexesByKey = new Map();
  oldChildren.forEach((child, i) => {
    const key = keyOf(child);
    if (key === null) return;
    if (!oldIndexesByKey.has(key)) oldIndexesByKey.set(key, []);
    oldIndexesByKey.get(key).push(i);
  });

  const claimed = new Array(oldChildren.length).fill(false);
  const pairs = []; // 새 순서대로 { oi, ni }
  const unmatchedNew = [];

  newChildren.forEach((child, ni) => {
    const key = keyOf(child);
    let oi;
    if (key !== null) oi = oldIndexesByKey.get(key)?.shift();
    else if (ni < oldChildren.length && keyOf(oldChildren[ni]) === null) oi = ni;

    if (oi !== undefined && !claimed[oi]) {
      claimed[oi] = true;
      pairs.push({ oi, ni });
    } else {
      unmatchedNew.push(ni);
    }
  });

  const stable = longestIncreasingSubsequence(pairs.map((p) => p.oi));

  pairs.forEach(({ oi, ni }, k) => {
    const oldChild = oldChildren[oi];
    const newChild = newChildren[ni];
    const childPath = [...path, oi];
    const stays = stable.has(k);

    if (isSameKind(oldChild, newChild)) {
      walk(oldChild, newChild, childPath, ops);
      if (!stays) ops.push({ type: OP.MOVE, path: childPath, parentPath: path, index: ni });
    } else if (stays) {
      // 제자리에 있는 노드는 그 자리에서 교체
      ops.push({ type: OP.REPLACE, path: childPath, node: newChild });
    } else {
      // 옮겨야 하는데 종류도 다르다 → 옮기느니 지우고 새로 만든다
      ops.push({ type: OP.REMOVE, path: childPath });
      ops.push({ type: OP.CREATE, parentPath: path, index: ni, node: newChild });
    }
  });

  for (const ni of unmatchedNew) {
    ops.push({ type: OP.CREATE, parentPath: path, index: ni, node: newChildren[ni] });
  }
  for (let oi = oldChildren.length - 1; oi >= 0; oi--) {
    if (!claimed[oi]) ops.push({ type: OP.REMOVE, path: [...path, oi] });
  }
}
