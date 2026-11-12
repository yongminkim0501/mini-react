import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from '../src/vdom.js';
import { FunctionComponent, useState, useEffect, useMemo } from '../src/component.js';

function setup(App) {
  const container = document.createElement('div');
  const comp = new FunctionComponent(App);
  comp.mount(container);
  return { container, comp };
}

test('mount: 부모/자식 컴포넌트와 props 전달', () => {
  const Child = ({ name, children }) => h('span', null, `hi ${name}`, ...children);
  const App = () => h('div', null, h(Child, { name: 'kim' }, '!'));
  const { container } = setup(App);
  assert.equal(container.innerHTML, '<div><span>hi kim!</span></div>');
});

test('useState: 클릭 -> setState -> update -> patch, 같은 DOM 유지', () => {
  let renders = 0;
  const Counter = ({ count, onInc }) => h('div', null, h('p', null, count), h('button', { onClick: onInc }, '+'));
  const App = () => {
    renders++;
    const [count, setCount] = useState(0);
    return h(Counter, { count, onInc: () => setCount(count + 1) });
  };
  const { container, comp } = setup(App);
  const p = container.querySelector('p');
  container.querySelector('button').click();
  container.querySelector('button').click();
  assert.equal(p.textContent, '2');
  assert.equal(container.querySelector('p'), p); // 노드 교체 없이 텍스트만 변경
  assert.equal(renders, 3);
  assert.equal(comp.hooks[0].value, 2);
});

test('useState: 함수형 업데이트, 여러 Hook 인덱스, 같은 값이면 렌더링 생략', () => {
  let set;
  let renders = 0;
  const App = () => {
    renders++;
    const [a, setA] = useState(1);
    const [b, setB] = useState(() => 'x');
    set = { setA, setB };
    return h('p', null, `${a}-${b}`);
  };
  const { container, comp } = setup(App);
  set.setA((v) => v + 1);
  set.setA((v) => v + 1); // 함수형: 최신 값 기준
  set.setB('y');
  assert.equal(container.textContent, '3-y');
  assert.deepEqual(comp.hooks.map((x) => x.value), [3, 'y']);
  const before = renders;
  set.setB('y'); // 동일 값
  assert.equal(renders, before);
});

test('useState: 텍스트 입력 시 input 노드 유지(focus 유지 조건)', () => {
  const App = () => {
    const [text, setText] = useState('');
    return h('div', null, h('input', { value: text, onInput: (e) => setText(e.target.value) }), h('p', null, text));
  };
  const { container } = setup(App);
  const input = container.querySelector('input');
  input.value = 'ab';
  input.dispatchEvent(new window.Event('input'));
  assert.equal(container.querySelector('input'), input);
  assert.equal(container.querySelector('p').textContent, 'ab');
});

test('목록 추가/삭제', () => {
  let api;
  const App = () => {
    const [items, setItems] = useState(['a', 'b', 'c']);
    api = setItems;
    return h('ul', null, items.map((t) => h('li', null, t)));
  };
  const { container } = setup(App);
  api((prev) => [...prev, 'd']);
  assert.equal(container.innerHTML, '<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul>');
  api((prev) => prev.filter((t) => t !== 'b'));
  assert.equal(container.innerHTML, '<ul><li>a</li><li>c</li><li>d</li></ul>');
  api([]);
  assert.equal(container.innerHTML, '<ul></ul>');
});

test('자식 컴포넌트에서 Hook 호출 시 에러 (과제 제약)', () => {
  const Child = () => { useState(0); return h('p', null, 'x'); };
  const App = () => h('div', null, h(Child, {}));
  assert.throws(() => setup(App), /루트 컴포넌트/);
});

test('조건문 안의 Hook -> 순서 변경 감지', () => {
  let toggle;
  const App = () => {
    const [on, setOn] = useState(true);
    toggle = setOn;
    if (on) useMemo(() => 1, []);
    useEffect(() => {}, []);
    return h('p', null, String(on));
  };
  setup(App);
  assert.throws(() => toggle(false), /Hook 호출 순서/);
});

test('useEffect: deps 없음 / [] / [값] + cleanup 순서 + patch 이후 실행', () => {
  const logs = [];
  let setCount;
  let setOther;
  const container = document.createElement('div');
  const App = () => {
    const [count, sc] = useState(0);
    const [other, so] = useState(0);
    setCount = sc;
    setOther = so;
    useEffect(() => { logs.push('every'); });
    useEffect(() => { logs.push('once'); return () => logs.push('once-cleanup'); }, []);
    useEffect(() => {
      logs.push(`count:${count} dom:${container.textContent}`); // patch가 끝난 DOM을 읽는다
      return () => logs.push(`cleanup:${count}`);
    }, [count]);
    return h('p', null, `${count}/${other}`);
  };
  const comp = new FunctionComponent(App);
  comp.mount(container);
  assert.deepEqual(logs, ['every', 'once', 'count:0 dom:0/0']);

  logs.length = 0;
  setOther(1);
  assert.deepEqual(logs, ['every']); // count 그대로 -> [count] effect 생략

  logs.length = 0;
  setCount(1);
  assert.deepEqual(logs, ['every', 'cleanup:0', 'count:1 dom:1/1']); // 재실행 전 이전 cleanup

  logs.length = 0;
  comp.unmount();
  assert.deepEqual(logs, ['once-cleanup', 'cleanup:1']);
  assert.equal(container.innerHTML, '');
});

test('useEffect 안의 setState -> 현재 갱신 후 재렌더링', () => {
  const App = () => {
    const [v, setV] = useState('loading');
    useEffect(() => { setV('done'); }, []);
    return h('p', null, v);
  };
  const { container } = setup(App);
  assert.equal(container.textContent, 'done');
});

test('useMemo: deps 같으면 재사용, 바뀌면 재계산', () => {
  let calls = 0;
  let setA;
  let setB;
  let last;
  const App = () => {
    const [a, sa] = useState(1);
    const [b, sb] = useState(0);
    setA = sa;
    setB = sb;
    last = useMemo(() => { calls++; return a * 10; }, [a]);
    return h('p', null, `${last}-${b}`);
  };
  const { container } = setup(App);
  assert.equal(calls, 1);
  setB(1);
  setB(2);
  assert.equal(calls, 1);
  assert.equal(container.textContent, '10-2');
  setA(5);
  assert.equal(calls, 2);
  assert.equal(last, 50);
});

test('통합: count 0->1 시 diff 결과는 TEXT + 핸들러 PROPS', () => {
  const App = () => {
    const [count, setCount] = useState(0);
    return h('div', null, h('p', null, count), h('button', { onClick: () => setCount((c) => c + 1) }, '+1'));
  };
  const container = document.createElement('div');
  const comp = new FunctionComponent(App);
  let patches;
  comp.onCommit = (p) => { patches = p; };
  comp.mount(container);
  container.querySelector('button').click();
  assert.deepEqual(patches.map((p) => [p.type, p.path]), [['TEXT', [0, 0]], ['PROPS', [1]]]);
  assert.equal(patches[0].text, '1');
  assert.equal(typeof patches[1].set.onClick, 'function');
});
