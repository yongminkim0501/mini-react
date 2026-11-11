import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../index.html?raw';
import type { Patch } from '../../src/core/diff';
import { FunctionComponent } from '../../src/runtime';
import { App, HOOK_LABELS } from './App';
import { createDebugPanel, splitEventPatches } from './debug';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let app: FunctionComponent;
let debug: ReturnType<typeof createDebugPanel>;
let commits: (readonly Patch[])[];
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const $$ = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));

/** 이벤트 교체를 뺀 마지막 Patch의 종류 목록 */
const lastPatchTypes = () => splitEventPatches(commits.at(-1) ?? []).shown.map((p) => p.type);
const items = () => $$('.todo').map((li) => `${li.querySelector('span')!.textContent}${li.querySelector('input')!.checked ? '☑' : '☐'}`);
const input = () => $<HTMLInputElement>('.todo-input input');

async function type(value: string) {
  input().value = value;
  input().dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}
async function click(element: HTMLElement) {
  element.click();
  await flush();
}
const button = (text: string) => $$('button').find((b) => b.textContent === text)!;
const todo = (text: string) => $$('.todo').find((li) => li.querySelector('span')!.textContent === text)!;

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const parsed = new DOMParser().parseFromString(pageHtml, 'text/html');
  parsed.querySelectorAll('script').forEach((script) => script.remove());
  document.body.replaceChildren(...Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true)));
  document.title = '';

  app = new FunctionComponent(App, $('#app'));
  debug = createDebugPanel($('#debug'), app, HOOK_LABELS);
  commits = [];
  app.onCommit = (patches) => {
    commits.push(patches);
    debug.record(patches);
  };
  app.mount();
  await flush();
});

afterEach(() => vi.restoreAllMocks());

describe('데모 기획서 6장 시나리오', () => {
  it('1. 페이지 로드', () => {
    expect($('h1').textContent).toBe('할 일 (남은 일 1개)');
    expect(items()).toEqual(['우유☑', '빵☐']);
    expect(document.title).toBe('할 일 1개');
    expect(debug.count).toBe(1);
    expect(commits).toEqual([[]]);
    expect(console.info).toHaveBeenCalledTimes(1);
  });

  it('2. 쌀 입력: input value PROPS만, counts·visible 재계산 없음', async () => {
    const memoBefore = [app.hooks[3], app.hooks[4]];
    await type('쌀');
    expect(input().value).toBe('쌀');
    expect(document.title).toBe('할 일 1개');
    expect(debug.count).toBe(2);
    expect(lastPatchTypes()).toEqual(['PROPS']);
    expect(splitEventPatches(commits.at(-1)!).shown[0]).toMatchObject({ path: [0, 1, 0], set: { value: '쌀' } });
    expect([app.hooks[3], app.hooks[4]]).toEqual(memoBefore);
    expect(app.hooks[3]).toBe(memoBefore[0]);
    expect($('.debug-hooks').textContent).not.toContain('재계산');
  });

  it('3. 추가: setState 2번에 렌더링 1번, TEXT·PROPS·CREATE·TEXT', async () => {
    await type('쌀');
    await click(button('추가'));
    expect(items()).toEqual(['우유☑', '빵☐', '쌀☐']);
    expect(input().value).toBe('');
    expect($('h1').textContent).toBe('할 일 (남은 일 2개)');
    expect(document.title).toBe('할 일 2개');
    expect(debug.count).toBe(3);
    expect(lastPatchTypes()).toEqual(['TEXT', 'PROPS', 'CREATE', 'TEXT']);
    expect($('.footer').textContent).toBe('완료 1개 / 전체 3개');
  });

  it('4. 빵 체크: 제목 effect만 실행, 우유·쌀 li는 같은 DOM 객체', async () => {
    await type('쌀');
    await click(button('추가'));
    const milk = todo('우유');
    const rice = todo('쌀');
    const info = vi.mocked(console.info).mock.calls.length;

    await click(todo('빵').querySelector('input')!);
    expect(items()).toEqual(['우유☑', '빵☑', '쌀☐']);
    expect($('h1').textContent).toBe('할 일 (남은 일 1개)');
    expect(document.title).toBe('할 일 1개');
    expect(debug.count).toBe(4);
    expect(lastPatchTypes()).toEqual(['TEXT', 'PROPS', 'PROPS', 'TEXT']);
    expect(todo('우유')).toBe(milk);
    expect(todo('쌀')).toBe(rice);
    expect(todo('빵').className).toBe('todo done');
    expect(vi.mocked(console.info).mock.calls.length).toBe(info);

    const hooks = $$('.debug-hooks li').map((li) => li.textContent);
    expect(hooks[5]).toContain('▶ 실행');
    expect(hooks[6]).not.toContain('▶ 실행');
  });

  it('5~6. 필터 진행 중 → 전체', async () => {
    await type('쌀');
    await click(button('추가'));
    await click(todo('빵').querySelector('input')!);

    await click(button('진행 중'));
    expect(items()).toEqual(['쌀☐']);
    expect(button('진행 중').className).toBe('filter active');
    expect(document.title).toBe('할 일 1개');
    expect(debug.count).toBe(5);
    expect(lastPatchTypes()).toContain('PROPS');

    await click(button('전체'));
    expect(items()).toEqual(['우유☑', '빵☑', '쌀☐']);
    expect(debug.count).toBe(6);
  });

  it('7. 우유 삭제', async () => {
    await type('쌀');
    await click(button('추가'));
    await click(todo('우유').querySelector('button')!);
    expect(items()).toEqual(['빵☐', '쌀☐']);
    expect(document.title).toBe('할 일 2개');
  });

  it('8. 공백만 입력 후 추가: 입력 렌더링만, 목록 변화 없음', async () => {
    await type('   ');
    const renders = debug.count;
    await click(button('추가'));
    expect(debug.count).toBe(renders);
    expect(items()).toEqual(['우유☑', '빵☐']);
  });

  it('Enter로 추가, 한글 조합 중 Enter는 무시', async () => {
    await type('쌀');
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    await flush();
    expect(items()).toHaveLength(2);
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(items()).toEqual(['우유☑', '빵☐', '쌀☐']);
  });
});

describe('데모 기획서 8장', () => {
  it('모든 렌더링에서 hooks 7칸 유지', async () => {
    const lengths = [app.hooks.length];
    await type('쌀');
    lengths.push(app.hooks.length);
    await click(button('추가'));
    lengths.push(app.hooks.length);
    await click(button('완료'));
    lengths.push(app.hooks.length);
    expect(lengths).toEqual([7, 7, 7, 7]);
    expect($('.debug-renders').textContent).toBe('렌더링 4회 · hooks 7칸');
  });

  it('디버그 패널: 이벤트 교체는 건수로 묶는다', async () => {
    await type('쌀');
    expect($('.debug-summary').textContent).toMatch(/^Patch 1건 · 이벤트 교체 \d+건$/);
    expect($$('.debug-patches li').map((li) => li.textContent)).toEqual(['PROPS [0,1,0] value="쌀"']);
  });
});
