import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h, domToVNode, htmlToVNodes, createDom, toHTML, textNode } from '../src/vdom.js';
import { diff } from '../src/diff.js';
import { patch } from '../src/patch.js';
import { History } from '../src/history.js';

function container(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

test('domToVNode: 요소/텍스트/속성/중첩/공백 무시', () => {
  const v = domToVNode(container('\n  <p class="a">hi <b>x</b></p>\n  <ul><li>1</li><li>2</li></ul>'));
  assert.deepEqual(v, {
    type: 'element', tag: 'div', props: {}, children: [
      { type: 'element', tag: 'p', props: { class: 'a' }, children: [textNode('hi '), { type: 'element', tag: 'b', props: {}, children: [textNode('x')] }] },
      { type: 'element', tag: 'ul', props: {}, children: [
        { type: 'element', tag: 'li', props: {}, children: [textNode('1')] },
        { type: 'element', tag: 'li', props: {}, children: [textNode('2')] },
      ] },
    ],
  });
});

test('domToVNode: 빈 노드', () => {
  assert.deepEqual(domToVNode(container('')), { type: 'element', tag: 'div', props: {}, children: [] });
});

test('htmlToVNodes: script·on*·javascript: 제거, 스크립트 미실행', () => {
  globalThis.__pwned = false;
  const nodes = htmlToVNodes('<script>globalThis.__pwned = true</script><a href="javascript:alert(1)" onclick="x()" title="t">a</a>');
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0].props, { title: 't' });
  assert.equal(globalThis.__pwned, false);
});

test('createDom: VNode -> 실제 DOM, attribute와 property', () => {
  const el = createDom(h('div', { id: 'r' }, h('input', { value: 'abc' }), h('input', { type: 'checkbox', checked: true }), 'text'));
  assert.equal(el.outerHTML, '<div id="r"><input value="abc"><input type="checkbox" checked="">text</div>');
  assert.equal(el.childNodes[0].value, 'abc');
  assert.equal(el.childNodes[1].checked, true);
});

test('toHTML -> htmlToVNodes 왕복 시 동일한 VNode', () => {
  const v = domToVNode(container('<p>hi <b>x</b> end</p><ul><li>1</li></ul><input type="checkbox" checked>'));
  const html = v.children.map((c) => toHTML(c)).join('\n');
  assert.deepEqual(htmlToVNodes(html), v.children);
});

test('diff 1: 노드 추가', () => {
  const p = diff(h('ul', null, h('li', null, 'a')), h('ul', null, h('li', null, 'a'), h('li', null, 'b')));
  assert.deepEqual(p, [{ type: 'CREATE', path: [1], node: h('li', null, 'b') }]);
});

test('diff 2: 노드 삭제 (뒤에서부터)', () => {
  const p = diff(h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c')), h('ul', null, h('li', null, 'a')));
  assert.deepEqual(p.map((x) => [x.type, x.path]), [['REMOVE', [2]], ['REMOVE', [1]]]);
});

test('diff 3: 태그/타입 변경 -> REPLACE', () => {
  assert.deepEqual(diff(h('div', null, h('p', null, 'a')), h('div', null, h('span', null, 'a'))).map((x) => x.type), ['REPLACE']);
  assert.deepEqual(diff(h('div', null, 'a'), h('div', null, h('b', null, 'a'))).map((x) => x.type), ['REPLACE']);
});

test('diff 4: 텍스트 변경', () => {
  assert.deepEqual(diff(h('p', null, 'a'), h('p', null, 'b')), [{ type: 'TEXT', path: [0], text: 'b' }]);
});

test('diff 5: 속성 추가·변경·제거', () => {
  const p = diff(h('p', { id: 'x', class: 'old' }), h('p', { class: 'new', title: 't' }));
  assert.deepEqual(p, [{ type: 'PROPS', path: [], set: { class: 'new', title: 't' }, remove: ['id'], removed: { id: 'x' } }]);
});

test('diff: 변경 없음 -> 빈 배열', () => {
  const make = () => h('div', { a: '1' }, h('p', null, 'x'), h('ul', null, h('li', null, 'y')));
  assert.deepEqual(diff(make(), make()), []);
});

test('diff: 중첩 + 여러 변경 동시', () => {
  const p = diff(
    h('div', null, h('section', { id: 'a' }, h('p', null, 'x')), h('b', null, 'y')),
    h('div', null, h('section', { id: 'b' }, h('p', null, 'z'), h('i', null, 'new'))),
  );
  assert.deepEqual(p.map((x) => [x.type, x.path]), [['PROPS', [0]], ['TEXT', [0, 0, 0]], ['CREATE', [0, 1]], ['REMOVE', [1]]]);
});

test('patch: 5가지 변경 반영 + 바뀌지 않은 노드는 같은 객체 유지', () => {
  const oldV = h('div', null, h('h1', { class: 'a' }, 'title'), h('p', null, 'keep'), h('span', null, 'old'), h('ul', null, h('li', null, '1'), h('li', null, '2')));
  const newV = h('div', null, h('h1', { title: 't' }, 'title2'), h('p', null, 'keep'), h('em', null, 'new'), h('ul', null, h('li', null, '1')), h('footer', null, 'f'));
  const root = createDom(oldV);
  const keepP = root.childNodes[1];
  const firstLi = root.childNodes[3].childNodes[0];
  const h1 = root.childNodes[0];

  const result = patch(root, diff(oldV, newV));
  assert.equal(result, root);
  assert.equal(root.outerHTML, '<div><h1 title="t">title2</h1><p>keep</p><em>new</em><ul><li>1</li></ul><footer>f</footer></div>');
  assert.equal(root.childNodes[1], keepP); // 변경 없음 -> 동일 객체
  assert.equal(root.childNodes[3].childNodes[0], firstLi);
  assert.equal(root.childNodes[0], h1); // 속성/텍스트만 변경 -> 동일 객체
  assert.equal(root.outerHTML, createDom(newV).outerHTML); // 처음부터 만든 결과와 같다
});

test('patch: 루트 교체 시 새 루트 반환', () => {
  const parent = document.createElement('div');
  const root = createDom(h('p', null, 'a'));
  parent.appendChild(root);
  const next = patch(root, diff(h('p', null, 'a'), h('section', null, 'b')));
  assert.equal(next.tagName, 'SECTION');
  assert.equal(parent.firstChild, next);
});

test('patch: property(value/checked) 갱신과 제거', () => {
  const oldV = h('div', null, h('input', { value: 'a' }), h('input', { type: 'checkbox', checked: '' }));
  const newV = h('div', null, h('input', { value: 'b' }), h('input', { type: 'checkbox' }));
  const root = createDom(oldV);
  patch(root, diff(oldV, newV));
  assert.equal(root.childNodes[0].value, 'b');
  assert.equal(root.childNodes[1].checked, false);
});

test('patch: 이벤트 리스너 교체 시 누적되지 않음', () => {
  const calls = [];
  const v1 = h('button', { onClick: () => calls.push(1) });
  const v2 = h('button', { onClick: () => calls.push(2) });
  const btn = createDom(v1);
  patch(btn, diff(v1, v2));
  btn.click();
  assert.deepEqual(calls, [2]);
  patch(btn, diff(v2, h('button', {})));
  btn.click();
  assert.deepEqual(calls, [2]);
});

test('patch: 여러 번 연속 실행', () => {
  let v = h('ul', null);
  const root = createDom(v);
  for (let n = 1; n <= 5; n++) {
    const next = h('ul', null, ...Array.from({ length: n }, (_, i) => h('li', null, `item ${i}`)));
    patch(root, diff(v, next));
    v = next;
  }
  assert.equal(root.childNodes.length, 5);
  patch(root, diff(v, h('ul', null, h('li', null, 'item 0'))));
  assert.equal(root.outerHTML, '<ul><li>item 0</li></ul>');
});

test('History: undo/redo, redo 분기 제거, 스냅샷 오염 방지', () => {
  const hist = new History(h('div', null, 'v0'));
  const s1 = h('div', null, 'v1');
  hist.push(s1);
  s1.children[0].text = 'MUTATED'; // 저장 후 원본을 고쳐도
  assert.equal(hist.current.children[0].text, 'v1'); // 기록은 그대로
  hist.current.children[0].text = 'MUTATED'; // 꺼낸 값을 고쳐도
  assert.equal(hist.current.children[0].text, 'v1');

  hist.push(h('div', null, 'v2'));
  assert.equal(hist.undo().children[0].text, 'v1');
  assert.equal(hist.undo().children[0].text, 'v0');
  assert.equal(hist.canUndo(), false);
  assert.equal(hist.redo().children[0].text, 'v1');

  hist.push(h('div', null, 'v3')); // v1에서 새 분기
  assert.equal(hist.canRedo(), false); // v2는 사라짐
  assert.deepEqual(hist.states.map((s) => s.children[0].text), ['v0', 'v1', 'v3']);
});

test('Phase 1 흐름: 편집 -> diff -> patch -> history -> undo/redo', () => {
  const actual = container('<h3>t</h3><p>a</p>');
  let current = domToVNode(actual);
  actual.replaceChildren(...current.children.map(createDom));
  const hist = new History(current);
  const p = actual.childNodes[1];

  const commit = (next) => { patch(actual, diff(current, next)); current = next; };
  const edited = { ...current, children: htmlToVNodes('<h3>t</h3><p>b</p><i>new</i>') };
  commit(edited);
  hist.push(edited);
  assert.equal(actual.innerHTML, '<h3>t</h3><p>b</p><i>new</i>');
  assert.equal(actual.childNodes[1], p);

  commit(hist.undo());
  assert.equal(actual.innerHTML, '<h3>t</h3><p>a</p>');
  commit(hist.redo());
  assert.equal(actual.innerHTML, '<h3>t</h3><p>b</p><i>new</i>');
});
