import { afterEach, describe, expect, it } from 'vitest';
import { FunctionComponent } from './FunctionComponent';
import { h } from './h';
import { useState } from './hooks/useState';
import { setInstrumentation } from './instrument';
import type { SetState } from './hooks/useState';

afterEach(() => setInstrumentation(null));

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('계측 훅', () => {
  it('등록하지 않으면 렌더링이 그대로 동작한다', async () => {
    let set!: SetState<number>;
    const App = () => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    };
    const container = document.createElement('div');
    new FunctionComponent(App, container).mount();
    set(1);
    await flush();
    expect(container.innerHTML).toBe('<p>1</p>');
  });

  it('렌더 시작 → 끝 → 커밋 순서로 호출하고 patch 개수를 넘긴다', async () => {
    const log: string[] = [];
    let set!: SetState<number>;
    const App = () => {
      const [n, setN] = useState(0);
      set = setN;
      return h('p', null, n);
    };
    const container = document.createElement('div');
    const root = new FunctionComponent(App, container);
    setInstrumentation({
      onRenderStart: (r) => log.push(`start:${r === root}`),
      onRenderEnd: (_r, { ok }) => log.push(`end:${ok}`),
      onCommit: ({ patchCount, mounted }) => log.push(`commit:${patchCount}:${mounted}`),
    });
    root.mount();
    set(1);
    await flush();
    expect(log).toEqual(['start:true', 'end:true', 'commit:0:true', 'start:true', 'end:true', 'commit:1:false']);
  });

  it('훅에서 오류가 나도 렌더링은 계속된다', () => {
    setInstrumentation({
      onRenderStart: () => {
        throw new Error('x');
      },
    });
    const container = document.createElement('div');
    new FunctionComponent(() => h('p', null, 'ok'), container).mount();
    expect(container.innerHTML).toBe('<p>ok</p>');
  });
});
