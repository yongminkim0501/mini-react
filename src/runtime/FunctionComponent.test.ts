import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Patch } from '../core/diff';
import { formatPatch } from '../app/log';
import { FunctionComponent } from './FunctionComponent';
import { h } from './h';

afterEach(() => vi.restoreAllMocks());

/** Hook 없이 바깥 변수로 화면을 바꾸는 컴포넌트. update()를 직접 불러 확인한다. */
function setup() {
  const model = { n: 0, fail: false };
  const calls = { count: 0 };
  const commits: (readonly Patch[])[] = [];
  const container = document.createElement('div');
  const Counter = () => {
    calls.count++;
    if (model.fail) throw new Error('렌더링 실패');
    return h('button', { class: 'btn' }, '클릭 ', model.n);
  };
  const app = new FunctionComponent(Counter, container);
  app.onCommit = (patches) => commits.push(patches);
  return { model, calls, commits, container, app };
}

describe('FunctionComponent (Hook 없는 컴포넌트)', () => {
  it('mount: 화면을 그리고 onCommit에 빈 배열', () => {
    const { app, container, commits } = setup();
    app.mount();
    expect(container.innerHTML).toBe('<button class="btn">클릭 0</button>');
    expect(app.isMounted).toBe(true);
    expect(commits).toEqual([[]]);
    expect(app.vnode?.tag).toBe('#root');
  });

  it('update: 바뀐 텍스트만 반영하고 button은 같은 객체', () => {
    const { app, container, commits, model, calls } = setup();
    app.mount();
    const button = container.firstElementChild;
    model.n = 1;
    app.update();

    expect(container.innerHTML).toBe('<button class="btn">클릭 1</button>');
    expect(container.firstElementChild).toBe(button);
    expect(commits[1]?.map(formatPatch)).toEqual(['TEXT [0,0] "클릭 1"']);
    expect(calls.count).toBe(2);
  });

  it('mount 전 update는 아무 일도 안 한다', () => {
    const { app, container, calls, commits } = setup();
    app.update();
    expect(container.innerHTML).toBe('');
    expect(calls.count).toBe(0);
    expect(commits).toEqual([]);
  });

  it('렌더링 중 오류: 이전 화면 유지, 콘솔 출력, 다음 update는 정상', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, container, model, commits } = setup();
    app.mount();
    model.fail = true;
    model.n = 5;
    app.update();

    expect(container.innerHTML).toBe('<button class="btn">클릭 0</button>');
    expect(error).toHaveBeenCalledTimes(1);
    expect(commits).toHaveLength(1);

    model.fail = false;
    app.update();
    expect(container.innerHTML).toBe('<button class="btn">클릭 5</button>');
  });

  it('첫 렌더링 오류: 컨테이너를 건드리지 않고 마운트되지 않음', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, container, model } = setup();
    container.innerHTML = '<p>기존</p>';
    model.fail = true;
    app.mount();
    expect(container.innerHTML).toBe('<p>기존</p>');
    expect(app.isMounted).toBe(false);
  });

  it('unmount: 컨테이너를 비우고 이후 update는 무시', () => {
    const { app, container, calls } = setup();
    app.mount();
    app.unmount();
    expect(container.innerHTML).toBe('');
    expect(app.isMounted).toBe(false);
    app.update();
    expect(calls.count).toBe(1);
  });

  it('루트 props와 빈 children을 받는다', () => {
    const container = document.createElement('div');
    const Hello = ({ name, children }: { name: string; children: readonly unknown[] }) =>
      h('p', null, `안녕 ${name} (${children.length})`);
    new FunctionComponent(Hello, container, { name: '민' }).mount();
    expect(container.textContent).toBe('안녕 민 (0)');
  });

  it('applyPatches가 대상을 못 찾으면 다시 그려 복구한다', () => {
    const { app, container, model } = setup();
    app.mount();
    container.replaceChildren();
    model.n = 2;
    app.update();
    expect(container.innerHTML).toBe('<button class="btn">클릭 2</button>');
  });
});
