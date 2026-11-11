import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent } from '../FunctionComponent';
import { h } from '../h';
import { SET_STATE_DURING_RENDER, useState } from './useState';
import type { SetState } from './useState';
import { useEffect } from './useEffect';
import { useMemo } from './useMemo';
import type { Child } from '../types';

afterEach(() => vi.restoreAllMocks());

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function start(App: () => Child) {
  const container = document.createElement('div');
  document.body.append(container);
  const app = new FunctionComponent(App, container);
  app.mount();
  return { app, container };
}

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

describe('useMemo 기획서 6장', () => {
  it('input만 바뀌면 다시 계산하지 않고, todos가 바뀌면 계산한다', async () => {
    let computeCount = 0;
    let setTodos: SetState<Todo[]> | undefined;
    const App = () => {
      const [todos, set] = useState<Todo[]>([
        { id: 'a', text: '우유', done: true },
        { id: 'b', text: '빵', done: false },
      ]);
      setTodos = set;
      const [input, setInput] = useState('');
      const remaining = useMemo(() => {
        computeCount++;
        return todos.filter((t) => !t.done).length;
      }, [todos]);
      return h(
        'div',
        null,
        h('input', { value: input, onInput: (e: Event) => setInput((e.target as HTMLInputElement).value) }),
        h('p', null, '남은 일: ', remaining),
      );
    };
    const { container } = start(App);
    const input = container.querySelector('input')!;
    const p = () => container.querySelector('p')!.textContent;
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await flush();
    };

    expect([p(), computeCount]).toEqual(['남은 일: 1', 1]);
    await type('a');
    expect([p(), computeCount, input.value]).toEqual(['남은 일: 1', 1, 'a']);
    await type('ab');
    expect([p(), computeCount]).toEqual(['남은 일: 1', 1]);
    setTodos!((todos) => [...todos, { id: 'c', text: '쌀', done: false }]);
    await flush();
    expect([p(), computeCount]).toEqual(['남은 일: 2', 2]);
  });
});

describe('useMemo 기획서 7장', () => {
  function withMemo<D>(deps: () => readonly D[] | undefined) {
    const compute = vi.fn(() => ({ made: true }));
    const results: unknown[] = [];
    let setN: SetState<number> | undefined;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      results.push(useMemo(compute, deps()));
      return h('p', null, n);
    };
    start(App);
    return { compute, results, bump: async () => { setN!((p) => p + 1); await flush(); } };
  }

  it('의존성 없음: 매 렌더링 계산', async () => {
    const { compute, bump } = withMemo(() => undefined);
    await bump();
    await bump();
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('[]: 1회만 계산하고 같은 객체를 돌려준다', async () => {
    const { compute, results, bump } = withMemo(() => []);
    await bump();
    await bump();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[2]);
  });

  it('같은 객체 의존성이면 다시 계산 안 함', async () => {
    const dep = { a: 1 };
    const { compute, bump } = withMemo(() => [dep]);
    await bump();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('내용이 같은 새 객체 의존성이면 다시 계산', async () => {
    const { compute, results, bump } = withMemo(() => [{ a: 1 }]);
    await bump();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(results[0]).not.toBe(results[1]);
  });

  it('계산 함수 안에서 setState는 오류', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = start(() => {
      const [n, setN] = useState(0);
      useMemo(() => setN(n + 1), [n]);
      return h('p');
    });
    expect(app.isMounted).toBe(false);
    expect(String(error.mock.calls[0]?.[1])).toContain(SET_STATE_DURING_RENDER);
  });
});

describe('Hook 실행 환경 기획서 6장 (세 Hook 함께)', () => {
  it('첫 렌더링 후 hooks 칸', () => {
    const { app, container } = start(() => {
      const [a] = useState(1);
      const doubled = useMemo(() => a * 2, [a]);
      useEffect(() => {}, [a]);
      return h('p', null, doubled);
    });
    expect(container.textContent).toBe('2');
    expect(app.hooks).toEqual([
      { kind: 'state', value: 1, setState: expect.any(Function) },
      { kind: 'memo', deps: [1], value: 2 },
      { kind: 'effect', deps: [1], cleanup: undefined },
    ]);
  });
});
