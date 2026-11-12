// diff.js — 이전 VNode와 새 VNode를 비교해 "patch 목록"을 만든다.
// 실제 DOM은 전혀 건드리지 않는다. 결과(배열)는 patch.js의 patch()가 받아서 DOM에 적용한다.
//
// patch 하나의 모양 (path = 루트부터 childNodes 인덱스 경로, [] 는 루트 자신)
//   { type: 'CREATE',  path, node }          노드 추가   (path 마지막 값 = 끼워 넣을 인덱스)
//   { type: 'REMOVE',  path }                노드 삭제
//   { type: 'REPLACE', path, node }          타입/태그가 달라 통째로 교체
//   { type: 'TEXT',    path, text }          텍스트 변경
//   { type: 'PROPS',   path, set, remove }   속성 추가·변경(set) / 제거(remove)
//
// 자식은 "같은 인덱스끼리" 비교한다. key 기반 재정렬은 구현하지 않았다.

import { TEXT } from './vdom.js';

export function diff(oldVNode, newVNode, path = [], patches = []) {
  // 3. 노드 종류(텍스트/요소) 또는 태그가 다르면 하위 비교 없이 교체
  if (oldVNode.type !== newVNode.type || oldVNode.tag !== newVNode.tag) {
    patches.push({ type: 'REPLACE', path, node: newVNode });
    return patches;
  }

  // 4. 텍스트 노드: 내용만 비교
  if (newVNode.type === TEXT) {
    if (oldVNode.text !== newVNode.text) patches.push({ type: 'TEXT', path, text: newVNode.text });
    return patches;
  }

  // 5. 같은 태그의 요소: 속성 비교
  const propsPatch = diffProps(oldVNode.props, newVNode.props);
  if (propsPatch) patches.push({ type: 'PROPS', path, ...propsPatch });

  // 자식 비교 (1. 추가 / 2. 삭제 / 재귀)
  diffChildren(oldVNode.children, newVNode.children, path, patches);
  return patches;
}

function diffProps(oldProps, newProps) {
  const set = {};
  const remove = [];
  for (const key of Object.keys(newProps)) {
    if (!Object.is(oldProps[key], newProps[key])) set[key] = newProps[key]; // 추가 또는 변경
  }
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) remove.push(key); // 제거
  }
  if (Object.keys(set).length === 0 && remove.length === 0) return null;
  // remove 처리 시 이벤트 리스너를 떼려면 이전 값이 필요하므로 함께 보낸다
  const removed = {};
  for (const key of remove) removed[key] = oldProps[key];
  return { set, remove, removed };
}

function diffChildren(oldChildren, newChildren, parentPath, patches) {
  const common = Math.min(oldChildren.length, newChildren.length);

  // 양쪽에 다 있는 인덱스: 재귀 비교
  for (let i = 0; i < common; i++) {
    diff(oldChildren[i], newChildren[i], [...parentPath, i], patches);
  }
  // 1. 새 쪽이 더 길면: 뒤쪽 노드 추가
  for (let i = oldChildren.length; i < newChildren.length; i++) {
    patches.push({ type: 'CREATE', path: [...parentPath, i], node: newChildren[i] });
  }
  // 2. 이전 쪽이 더 길면: 뒤에서부터 삭제 (앞에서 지우면 뒤 인덱스가 당겨져 경로가 틀어진다)
  for (let i = oldChildren.length - 1; i >= newChildren.length; i--) {
    patches.push({ type: 'REMOVE', path: [...parentPath, i] });
  }
}
