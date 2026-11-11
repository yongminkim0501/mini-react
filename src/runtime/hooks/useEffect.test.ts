import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent } from '../FunctionComponent';
import { h } from '../h';
import type { EffectSlot } from '../hookRuntime';
import type { Child } from '../types';
import { MAX_CHAINED_UPDATES } from './scheduler';
import { useEffect } from './useEffect';
import { useState } from './useState';
import type { SetState } from './useState';

afterEach(() => vi.restoreAllMocks());

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function start(App: () => Child) {
  const container = document.createElement('div');
  document.body.append(container);
  const app = new FunctionComponent(App, container);
  app.mount();
  return { app, container, button: () => container.querySelector('button')! };
}

describe('useEffect 기획서 6장', () => {
  it('mount → 클릭 → 클릭 → 같은 값 → unmount 순서', async () => {
    const log: string[] = [];
    let setN: SetState<number> | undefined;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      useEffect(() => {
        log.push(`effect ${n}`);
        document.title = `클릭 ${n}회`;
        return () => log.push(`cleanup ${n}`);
      }, [n]);
      useEffect(() => {
        log.push('mount only');
      }, []);
      return h('button', { onClick: () => set((p) => p + 1) }, n);
    };
    const { app, button } = start(App);
    const step = () => log.splice(0);

    expect([step(), document.title]).toEqual([['effect 0', 'mount only'], '클릭 0회']);
    button().click();
    await flush();
    expect([step(), document.title]).toEqual([['cleanup 0', 'effect 1'], '클릭 1회']);
    button().click();
    await flush();
    expect([step(), document.title]).toEqual([['cleanup 1', 'effect 2'], '클릭 2회']);
    setN!(2);
    await flush();
    expect([step(), document.title]).toEqual([[], '클릭 2회']);
    app.unmount();
    expect([step(), document.title]).toEqual([['cleanup 2'], '클릭 2회']);
  });

  it('effect 안에서 DOM을 읽으면 이미 반영된 값', async () => {
    const seen: string[] = [];
    const App = () => {
      const [n, set] = useState(0);
      useEffect(() => {
        seen.push(document.querySelector('#fx')!.textContent!);
      });
      return h('button', { id: 'fx', onClick: () => set(n + 1) }, n);
    };
    const { button } = start(App);
    button().click();
    await flush();
    expect(seen).toEqual(['0', '1']);
  });
});

describe('useEffect 기획서 7장', () => {
  /** 바깥에서 rerender를 부를 수 있는 컴포넌트 */
  function counter(useBody: (n: number, set: SetState<number>) => void) {
    let setN: SetState<number> | undefined;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      useBody(n, set);
      return h('p', null, n);
    };
    const started = start(App);
    return { ...started, bump: async () => { setN!((p) => p + 1); await flush(); } };
  }

  it('의존성 없음: 매 렌더링 후 실행', async () => {
    const fx = vi.fn();
    const { bump } = counter(() => useEffect(fx));
    await bump();
    await bump();
    expect(fx).toHaveBeenCalledTimes(3);
  });

  it('[]: 1회만 실행', async () => {
    const fx = vi.fn();
    const { bump } = counter(() => useEffect(fx, []));
    await bump();
    await bump();
    expect(fx).toHaveBeenCalledTimes(1);
  });

  it('effect 안 setState (deps 사용): 다음 렌더링 1회, 무한 반복 없음', async () => {
    let renders = 0;
    const App = () => {
      renders++;
      const [loaded, setLoaded] = useState(false);
      useEffect(() => {
        setLoaded(true);
      }, []);
      return h('p', null, loaded ? '완료' : '로딩');
    };
    const { container } = start(App);
    await flush();
    await flush();
    expect(container.textContent).toBe('완료');
    expect(renders).toBe(2);
  });

  it(`deps 없이 effect 안 setState: ${MAX_CHAINED_UPDATES}회 연속에서 중단하고 오류`, async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let renders = 0;
    const App = () => {
      renders++;
      const [n, setN] = useState(0);
      useEffect(() => setN(n + 1));
      return h('p', null, n);
    };
    start(App);
    await flush();
    await flush();
    expect(renders).toBe(MAX_CHAINED_UPDATES + 1);
    expect(String(error.mock.calls[0]?.[0])).toContain('연속');
  });

  it('effect 2개 중 첫 번째가 오류여도 두 번째는 실행', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    start(() => {
      useEffect(() => {
        throw new Error('effect 실패');
      });
      useEffect(second);
      return h('p');
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('unmount: 모든 정리 함수 실행', () => {
    const cleanups: string[] = [];
    const { app } = start(() => {
      useEffect(() => () => cleanups.push('a'), []);
      useEffect(() => undefined);
      useEffect(() => () => cleanups.push('c'));
      return h('p');
    });
    app.unmount();
    expect(cleanups).toEqual(['a', 'c']);
  });

  it('렌더링 오류로 반영되지 않으면 effect 실행 안 됨, deps 저장 안 됨', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fx = vi.fn();
    let fail = false;
    let setN: SetState<number> | undefined;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      useEffect(fx, [n]);
      if (fail) throw new Error('렌더링 실패');
      return h('p', null, n);
    };
    const { app, container } = start(App);
    fail = true;
    setN!(1);
    await flush();
    expect(error).toHaveBeenCalled();
    expect(fx).toHaveBeenCalledTimes(1);
    expect((app.hooks[1] as EffectSlot).deps).toEqual([0]);
    expect(container.textContent).toBe('0');

    fail = false;
    setN!(2);
    await flush();
    expect(fx).toHaveBeenCalledTimes(2);
    expect((app.hooks[1] as EffectSlot).deps).toEqual([2]);
  });
});
