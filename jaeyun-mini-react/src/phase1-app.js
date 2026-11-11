// phase1-app.js — Phase 1 테스트 페이지 컨트롤러
// 실제 영역(#actual)  <-- patch --  diff(이전 VNode, 새 VNode)  <-- 편집 영역(#editor)

import { domToVNode, htmlToVNodes, createDom, toHTML } from './vdom.js';
import { diff } from './diff.js';
import { patch, getNode } from './patch.js';
import { History } from './history.js';

const actual = document.getElementById('actual');
const editor = document.getElementById('editor');
const patchBtn = document.getElementById('patch-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const patchLog = document.getElementById('patch-log');
const vdomView = document.getElementById('vdom-view');
const historyInfo = document.getElementById('history-info');

// [1] 최초 로드: 실제 영역의 샘플 HTML -> VNode
let currentVNode = domToVNode(actual);
// 실제 영역을 VNode로 다시 그린다. HTML 소스의 공백 텍스트 노드를 없애서
// VNode children 인덱스와 실제 DOM childNodes 인덱스를 일치시키기 위함.
actual.replaceChildren(...currentVNode.children.map(createDom));

const history = new History(currentVNode);

// [2] 그 VNode로 편집 영역을 렌더링
renderEditor(currentVNode);
refreshUI([]);

// [3]~[7] 사용자가 편집 후 Patch 클릭
patchBtn.addEventListener('click', () => {
  // [4] 편집 영역 HTML -> 새 VNode (루트 #actual 자체의 태그/속성은 그대로 유지)
  const nextVNode = { ...currentVNode, props: { ...currentVNode.props }, children: htmlToVNodes(editor.value) };
  const patches = commit(nextVNode); // [5] diff + [6] patch
  if (patches.length > 0) history.push(nextVNode); // [7] 변경이 있을 때만 기록
  renderEditor(nextVNode); // 정규화(공백 제거·위험 요소 제거)된 HTML로 편집 영역 갱신
  refreshUI(patches);
});

// [8] 뒤로가기 / 앞으로가기: 기록된 VNode로 이동 -> 같은 diff/patch 경로로 실제 영역 갱신
undoBtn.addEventListener('click', () => moveTo(history.undo()));
redoBtn.addEventListener('click', () => moveTo(history.redo()));

function moveTo(targetVNode) {
  const patches = commit(targetVNode);
  renderEditor(targetVNode);
  refreshUI(patches);
}

// 이전 VNode와 비교해 바뀐 부분만 실제 영역에 반영하고 currentVNode를 교체한다
function commit(nextVNode) {
  const patches = diff(currentVNode, nextVNode);
  patch(actual, patches);
  currentVNode = nextVNode;
  flash(patches);
  return patches;
}

function renderEditor(vnode) {
  editor.value = vnode.children.map((child) => toHTML(child)).join('\n');
}

function refreshUI(patches) {
  undoBtn.disabled = !history.canUndo();
  redoBtn.disabled = !history.canRedo();
  historyInfo.textContent = `History ${history.index + 1} / ${history.states.length}`;
  patchLog.textContent = patches.length
    ? patches.map((p) => JSON.stringify(p)).join('\n')
    : '(변경 없음 — 적용된 patch 0개)';
  vdomView.textContent = JSON.stringify(currentVNode, null, 2);
}

// 바뀐 노드를 잠깐 강조해서 "변경된 부분만" 바뀌었음을 눈으로 확인.
// class를 붙이면 실제 DOM 속성이 VNode와 달라지므로, 속성을 건드리지 않는 element.animate()를 쓴다.
function flash(patches) {
  for (const p of patches) {
    if (p.type === 'REMOVE') continue;
    let node = getNode(actual, p.path);
    if (node && node.nodeType === 3) node = node.parentNode; // 텍스트는 부모 요소를 강조
    if (!node || node === actual) continue;
    node.animate([{ backgroundColor: '#ffe066' }, { backgroundColor: 'transparent' }], { duration: 1200 });
  }
}
