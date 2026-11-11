import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Patch } from '../../core/diff';
import { formatPatch } from '../../app/log';
import { FunctionComponent } from '../FunctionComponent';
import { h } from '../h';
import type { StateSlot } from '../hookRuntime';
import type { Child } from '../types';
import { SET_STATE_DURING_RENDER, useState } from './useState';
import type { SetState } from './useState';

afterEach(() => vi.restoreAllMocks());

/** 예약된 마이크로태스크 update가 끝날 때까지 기다린다. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const values = (app: FunctionComponent) => (app.hooks as StateSlot[]).map((slot) => slot.value);

function start(App: () => Child) {
  const container = document.createElement('div');
  document.body.append(container);
  const app = new FunctionComponent(App, container);
  const commits: (readonly Patch[])[] = [];
  app.onCommit = (patches) => commits.push(patches);
  app.mount();
  return { app, container, commits, button: () => container.querySelector('button')! };
}

describe('FunctionComponent 기획서 7장 (Counter)', () => {
  it('클릭하면 같은 칸, 같은 setState, 같은 button으로 갱신', async () => {
    let runs = 0;
    const Counter = () => {
      runs++;
      const [n, setN] = useState(0);
      return h('button', { onClick: () => setN(n + 1) }, '클릭 ', n);
    };
    const { app, container, commits, button } = start(Counter);
    const first = button();
    const setState = (app.hooks[0] as StateSlot).setState;

    expect(container.innerHTML).toBe('<button>클릭 0</button>');
    expect(app.hooks).toEqual([{ kind: 'state', value: 0, setState }]);
    expect(commits).toEqual([[]]);

    button().click();
    await flush();
    expect(container.innerHTML).toBe('<button>클릭 1</button>');
    expect(app.hooks).toEqual([{ kind: 'state', value: 1, setState }]);
    expect((app.hooks[0] as StateSlot).setState).toBe(setState);
    expect(commits[1]?.map(formatPatch)).toEqual(['PROPS [0] onClick=ƒ', 'TEXT [0,0] "클릭 1"']);
    expect(button()).toBe(first);

    for (let i = 0; i < 4; i++) {
      button().click();
      await flush();
    }
    expect(container.textContent).toBe('클릭 5');
    expect(runs).toBe(6);
    expect(app.hooks).toHaveLength(1);
  });

  it('같은 페이지의 인스턴스 2개는 hooks가 섞이지 않는다', async () => {
    const Counter = () => {
      const [n, setN] = useState(0);
      return h('button', { onClick: () => setN((p) => p + 1) }, n);
    };
    const a = start(Counter);
    const b = start(Counter);
    a.button().click();
    a.button().click();
    await flush();
    b.button().click();
    await flush();
    expect(values(a.app)).toEqual([2]);
    expect(values(b.app)).toEqual([1]);
    a.button().click();
    await flush();
    expect([a.container.textContent, b.container.textContent]).toEqual(['3', '1']);
  });
});

describe('useState 기획서 6장', () => {
  it('setState 3번에 렌더링 1번, 함수형 업데이트는 누적', async () => {
    let runs = 0;
    const App = () => {
      runs++;
      const [n, setN] = useState(0);
      const [text, setText] = useState(() => '시작');
      return h(
        'div',
        null,
        h('p', null, text, ': ', n),
        h('button', { onClick: () => { setN((p) => p + 1); setN((p) => p + 1); setText('변경'); } }, '+2'),
      );
    };
    const { app, container, commits, button } = start(App);
    const p = () => container.querySelector('p')!.textContent;

    expect([p(), values(app), runs]).toEqual(['시작: 0', [0, '시작'], 1]);
    button().click();
    await flush();
    expect([p(), values(app), runs]).toEqual(['변경: 2', [2, '변경'], 2]);
    button().click();
    await flush();
    expect([p(), values(app), runs]).toEqual(['변경: 4', [4, '변경'], 3]);
    expect(commits[2]?.map(formatPatch)).toEqual(['TEXT [0,0,0] "변경: 4"', 'PROPS [0,1] onClick=ƒ']);
  });
});

describe('useState 기획서 7장', () => {
  /** 바깥에서 setState를 직접 부를 수 있게 꺼내 둔다. */
  function counter() {
    const handle: { set?: SetState<number>; runs: number } = { runs: 0 };
    const App = () => {
      handle.runs++;
      const [n, setN] = useState(0);
      handle.set = setN;
      return h('p', null, n);
    };
    return { handle, ...start(App) };
  }

  it('같은 값이면 렌더링하지 않는다', async () => {
    const { handle } = counter();
    handle.set!(0);
    await flush();
    expect(handle.runs).toBe(1);
  });

  it('값으로 3번은 +1, 함수로 3번은 +3에 렌더링 1번', async () => {
    let captured: { n: number; set: SetState<number> } | undefined;
    let runs = 0;
    const App = () => {
      runs++;
      const [n, set] = useState(0);
      captured = { n, set };
      return h('p', null, n);
    };
    const { container } = start(App);
    const { n, set } = captured!;
    set(n + 1);
    set(n + 1);
    set(n + 1);
    await flush();
    expect(container.textContent).toBe('1');

    captured!.set((p) => p + 1);
    captured!.set((p) => p + 1);
    captured!.set((p) => p + 1);
    await flush();
    expect(container.textContent).toBe('4');
    expect(runs).toBe(3);
  });

  it('렌더링 중 setState는 오류 (화면 유지)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let trigger = false;
    const { handle, container } = counter();
    const App2 = () => {
      const [n, setN] = useState(0);
      if (trigger) setN(n + 1);
      return h('p', null, n);
    };
    const app2 = start(App2);
    trigger = true;
    app2.app.update();
    expect(String(error.mock.calls[0]?.[1])).toContain(SET_STATE_DURING_RENDER);
    expect(app2.container.textContent).toBe('0');
    expect(container.textContent).toBe('0');
    expect(handle.runs).toBe(1);
  });

  it('unmount 후 setState는 무시하고 오류 없음', async () => {
    const { handle, app, container } = counter();
    app.unmount();
    expect(() => handle.set!(5)).not.toThrow();
    await flush();
    expect(container.innerHTML).toBe('');
    expect(handle.runs).toBe(1);
  });

  it('렌더링 2회 후에도 setState는 같은 함수', async () => {
    const { handle } = counter();
    const first = handle.set;
    handle.set!(1);
    await flush();
    handle.set!(2);
    await flush();
    expect(handle.runs).toBe(3);
    expect(handle.set).toBe(first);
  });

  it('초기값 함수는 첫 렌더링에서만 1회 실행', async () => {
    const init = vi.fn(() => 10);
    let set: SetState<number> | undefined;
    const App = () => {
      const [n, s] = useState(init);
      set = s;
      return h('p', null, n);
    };
    const { container } = start(App);
    set!((p) => p + 1);
    await flush();
    expect(container.textContent).toBe('11');
    expect(init).toHaveBeenCalledTimes(1);
  });
});
