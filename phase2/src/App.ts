import { h, useEffect, useMemo, useState } from '../../src/runtime';
import { FilterBar } from './components/FilterBar';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { TodoInput } from './components/TodoInput';
import { TodoList } from './components/TodoList';
import type { Counts, Filter, Todo } from './types';

export const INITIAL_TODOS: readonly Todo[] = [
  { id: '1', text: '우유', done: true },
  { id: '2', text: '빵', done: false },
];

/** 디버그 패널에 보여줄 Hook 이름. App의 Hook 호출 순서와 같다. */
export const HOOK_LABELS = ['todos', 'input', 'filter', 'visible', 'counts', '제목 effect', '시작 로그 effect'] as const;

export function filterTodos(todos: readonly Todo[], filter: Filter): readonly Todo[] {
  if (filter === 'active') return todos.filter((todo) => !todo.done);
  if (filter === 'done') return todos.filter((todo) => todo.done);
  return todos;
}

export function countTodos(todos: readonly Todo[]): Counts {
  const done = todos.filter((todo) => todo.done).length;
  return { remaining: todos.length - done, done, total: todos.length };
}

/** 증가하는 숫자를 문자열로. 지금 목록의 가장 큰 id + 1 */
export function nextId(todos: readonly Todo[]): string {
  return String(todos.reduce((max, todo) => Math.max(max, Number(todo.id) || 0), 0) + 1);
}

/** 루트 컴포넌트. 상태와 Hook은 모두 여기에만 두고 자식에게는 값과 함수를 props로 내려준다. */
export function App() {
  const [todos, setTodos] = useState<readonly Todo[]>(INITIAL_TODOS);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => filterTodos(todos, filter), [todos, filter]);
  const counts = useMemo(() => countTodos(todos), [todos]);

  useEffect(() => {
    document.title = `할 일 ${counts.remaining}개`;
  }, [counts.remaining]);
  useEffect(() => {
    console.info('[App] mount: Todo 데모 시작');
  }, []);

  const onInput = (event: Event) => setInput((event.target as HTMLInputElement).value);
  const onAdd = () => {
    const text = input.trim();
    if (text === '') return;
    // 이전 값에 의존하는 변경은 함수형으로 쓴다.
    setTodos((prev) => [...prev, { id: nextId(prev), text, done: false }]);
    setInput('');
  };
  const onToggle = (id: string) =>
    setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));
  const onRemove = (id: string) => setTodos((prev) => prev.filter((todo) => todo.id !== id));

  return h(
    'main',
    { class: 'todo-app' },
    h(Header, { remaining: counts.remaining }),
    h(TodoInput, { value: input, onInput, onAdd }),
    h(FilterBar, { filter, onChange: setFilter }),
    h(TodoList, { items: visible, onToggle, onRemove }),
    h(Footer, { doneCount: counts.done, total: counts.total }),
  );
}
