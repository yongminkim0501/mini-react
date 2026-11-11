import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent } from './FunctionComponent';
import { h } from './h';
import {
  HOOK_IN_CHILD,
  HOOK_OUTSIDE_RENDER,
  depsChanged,
  getCurrentComponent,
  useHookSlot,
} from './hookRuntime';
import type { MemoSlot } from './hookRuntime';
import type { Child } from './types';

afterEach(() => vi.restoreAllMocks());

/** 테스트용 Hook: memo 칸에 렌더링 횟수를 쌓는다. 칸을 만들고 다시 읽는지 확인한다. */
function useRenderCount(): number {
  const { component, index, slot } = useHookSlot('memo');
  if (!slot) {
    const created: MemoSlot = { kind: 'memo', deps: undefined, value: 1 };
    component.hooks[index] = created;
    return 1;
  }
  slot.value = (slot.value as number) + 1;
  return slot.value as number;
}

function mountApp(App: () => Child) {
  const container = document.createElement('div');
  const app = new FunctionComponent(App, container);
  app.mount();
  return { app, container };
}

describe('depsChanged 기획서 6장', () => {
  it.each([
    [[1, 'a'], [1, 'a'], false],
    [[1], [2], true],
    [[NaN], [NaN], false],
    [[{}], [{}], true],
    [[1], undefined, true],
    [undefined, [1], true],
    [[1], [1, 2], true],
    [[], [], false],
  ] as const)('%j → %j: %s', (prev, next, expected) => {
    expect(depsChanged(prev, next)).toBe(expected);
  });
});

describe('useHookSlot', () => {
  it('두 번째 렌더링은 새 칸을 만들지 않고 기존 칸을 읽는다', () => {
    let seen = 0;
    const App = () => {
      seen = useRenderCount();
      useRenderCount();
      return h('p', null, seen);
    };
    const { app, container } = mountApp(App);
    app.update();
    app.update();
    expect(seen).toBe(3);
    expect(app.hooks).toHaveLength(2);
    expect(container.textContent).toBe('3');
  });

  it('컴포넌트 밖에서 호출하면 오류', () => {
    expect(() => useHookSlot('state')).toThrow(HOOK_OUTSIDE_RENDER);
  });

  it('자식 컴포넌트에서 호출하면 오류 (화면은 그리지 않음)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Child = () => {
      useRenderCount();
      return h('span');
    };
    const { app, container } = mountApp(() => h('div', null, h(Child, null)));
    expect(app.isMounted).toBe(false);
    expect(container.innerHTML).toBe('');
    expect(String(error.mock.calls[0]?.[1])).toContain(HOOK_IN_CHILD);
  });

  it('조건에 따라 Hook 개수가 바뀌면 오류, 이전 화면 유지', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let flag = true;
    const App = () => {
      useRenderCount();
      if (flag) useRenderCount();
      return h('p', null, flag ? 'on' : 'off');
    };
    const { app, container } = mountApp(App);
    flag = false;
    app.update();
    expect(container.textContent).toBe('on');
    expect(String(error.mock.calls[0]?.[1])).toMatch(/Hook 호출 개수가 바뀌었습니다 \(이전 2개, 이번 1개\)/);
    expect(app.hooks).toHaveLength(2);
  });

  it('칸 종류가 다르면 순서 변경 오류', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let first = true;
    const App = () => {
      if (first) useRenderCount();
      else useHookSlot('state');
      return null;
    };
    const { app } = mountApp(App);
    first = false;
    app.update();
    expect(String(error.mock.calls[0]?.[1])).toMatch(/Hook 호출 순서가 바뀌었습니다: 0번 칸은 memo인데 state/);
  });

  it('렌더링 후, 그리고 렌더링 중 오류가 나도 현재 컴포넌트는 null로 돌아간다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mountApp(() => h('p'));
    expect(getCurrentComponent()).toBeNull();

    mountApp(() => {
      useRenderCount();
      throw new Error('실패');
    });
    expect(getCurrentComponent()).toBeNull();
    expect(() => useHookSlot('memo')).toThrow(HOOK_OUTSIDE_RENDER);
  });

  it('렌더링 안에서 다른 인스턴스를 렌더링해도 칸이 섞이지 않는다', () => {
    const inner = document.createElement('div');
    let innerApp: FunctionComponent | undefined;
    const Inner = () => {
      useRenderCount();
      return h('i');
    };
    const Outer = () => {
      useRenderCount();
      if (!innerApp) {
        innerApp = new FunctionComponent(Inner, inner);
        innerApp.mount();
      }
      useRenderCount();
      return h('b');
    };
    const { app } = mountApp(Outer);
    expect(app.hooks).toHaveLength(2);
    expect(innerApp?.hooks).toHaveLength(1);
  });
});
