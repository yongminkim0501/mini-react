// phase2-app.js — Phase 2 데모: 루트 App(State/Hook 보유) + Stateless 자식 컴포넌트
import { h } from './vdom.js';
import { FunctionComponent, useState, useEffect, useMemo } from './component.js';

const effectLog = document.getElementById('effect-log');
const patchLog = document.getElementById('patch-log');

function log(message) {
  const line = document.createElement('div');
  line.textContent = message;
  effectLog.prepend(line);
}

// ---------- Stateless 자식 컴포넌트: props만 받아 VNode를 반환 ----------

function Counter({ count, onIncrement, onDecrement }) {
  return h('div', { class: 'card' },
    h('h2', null, '카운터'),
    h('p', { class: 'count' }, count),
    h('button', { onClick: onDecrement }, '-1'),
    h('button', { onClick: onIncrement }, '+1'),
  );
}

function TodoInput({ value, onInput, onAdd }) {
  return h('div', { class: 'card' },
    h('h2', null, '할 일 추가'),
    h('input', {
      value,
      placeholder: '입력 후 Enter 또는 추가',
      onInput,
      onKeydown: (e) => { if (e.key === 'Enter') onAdd(); },
    }),
    h('button', { onClick: onAdd, disabled: value.trim() === '' }, '추가'),
    h('p', { class: 'muted' }, `미리보기: ${value || '(비어 있음)'}`),
  );
}

function TodoItem({ todo, onToggle, onRemove }) {
  return h('li', { class: todo.done ? 'done' : '' },
    h('input', { type: 'checkbox', checked: todo.done, onChange: () => onToggle(todo.id) }),
    h('span', null, todo.title),
    h('button', { onClick: () => onRemove(todo.id) }, '삭제'),
  );
}

function TodoList({ todos, onToggle, onRemove }) {
  return h('div', { class: 'card' },
    h('h2', null, '할 일 목록'),
    todos.length === 0
      ? h('p', { class: 'muted' }, '할 일이 없습니다.')
      : h('ul', null, todos.map((todo) => h(TodoItem, { todo, onToggle, onRemove }))),
  );
}

function Stats({ total, done }) {
  return h('div', { class: 'card' },
    h('h2', null, '통계 (useMemo)'),
    h('p', null, `완료 ${done} / 전체 ${total}`),
  );
}

// ---------- 루트 컴포넌트: 모든 State와 Hook은 여기에만 (Lifting State Up) ----------

let nextId = 3;

function App() {
  const [count, setCount] = useState(0);                       // hooks[0]
  const [text, setText] = useState('');                        // hooks[1]
  const [todos, setTodos] = useState([                         // hooks[2]
    { id: 1, title: 'Virtual DOM 이해하기', done: true },
    { id: 2, title: 'Hook 순서 설명하기', done: false },
  ]);

  const doneCount = useMemo(() => {                            // hooks[3]
    log(`useMemo 재계산 (todos ${todos.length}개)`);
    return todos.filter((t) => t.done).length;
  }, [todos]);

  useEffect(() => {                                            // hooks[4]
    document.title = `count: ${count}`;
    log(`effect 실행: count = ${count}`);
    return () => log(`cleanup 실행: 이전 count = ${count}`);
  }, [count]);

  useEffect(() => {                                            // hooks[5]
    log('effect 실행: [] → 최초 1회만');
  }, []);

  const addTodo = () => {
    if (text.trim() === '') return;
    setTodos((prev) => [...prev, { id: nextId++, title: text.trim(), done: false }]);
    setText('');
  };

  return h('div', { class: 'app' },
    h(Counter, {
      count,
      onIncrement: () => setCount((c) => c + 1),
      onDecrement: () => setCount((c) => c - 1),
    }),
    h(TodoInput, { value: text, onInput: (e) => setText(e.target.value), onAdd: addTodo }),
    h(TodoList, {
      todos,
      onToggle: (id) => setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
      onRemove: (id) => setTodos((prev) => prev.filter((t) => t.id !== id)),
    }),
    h(Stats, { total: todos.length, done: doneCount }),
  );
}

const app = new FunctionComponent(App);
let updateCount = 0;
app.onCommit = (patches) => {
  updateCount++;
  patchLog.textContent =
    `#${updateCount} 렌더링 → patch ${patches.length}개\n` + patches.map((p) => JSON.stringify(p, replacer)).join('\n');
};
app.mount(document.getElementById('root'));

// 함수(이벤트 핸들러)는 JSON에 안 나오므로 표시용으로 바꿔준다
function replacer(key, value) {
  return typeof value === 'function' ? `[function ${value.name || 'anonymous'}]` : value;
}

window.app = app; // 콘솔에서 app.hooks 확인용
