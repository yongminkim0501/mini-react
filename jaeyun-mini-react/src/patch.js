// patch.js — diff()가 만든 patch 목록을 실제 DOM에 적용한다.
// patch 목록에 없는 DOM 노드는 손대지 않으므로 같은 객체(===)로 유지된다.

import { createDom, setProp, removeProp } from './vdom.js';

// rootDom: diff의 oldVNode에 대응하는 실제 DOM 노드
// 반환값: 적용 후의 루트 DOM (루트가 REPLACE되면 새 노드가 된다)
export function patch(rootDom, patches) {
  let root = rootDom;

  for (const p of patches) {
    switch (p.type) {
      case 'CREATE': {
        const parent = getNode(root, p.path.slice(0, -1));
        const index = p.path[p.path.length - 1];
        parent.insertBefore(createDom(p.node), parent.childNodes[index] ?? null);
        break;
      }
      case 'REMOVE': {
        getNode(root, p.path).remove();
        break;
      }
      case 'REPLACE': {
        const oldNode = getNode(root, p.path);
        const newNode = createDom(p.node);
        oldNode.replaceWith(newNode);
        if (p.path.length === 0) root = newNode;
        break;
      }
      case 'TEXT': {
        getNode(root, p.path).nodeValue = p.text;
        break;
      }
      case 'PROPS': {
        const el = getNode(root, p.path);
        for (const [key, value] of Object.entries(p.set)) setProp(el, key, value);
        for (const key of p.remove) removeProp(el, key, p.removed[key]);
        break;
      }
      default:
        throw new Error(`알 수 없는 patch 타입: ${p.type}`);
    }
  }
  return root;
}

// path [1, 0] => root.childNodes[1].childNodes[0]
export function getNode(root, path) {
  let node = root;
  for (const index of path) node = node.childNodes[index];
  return node;
}
