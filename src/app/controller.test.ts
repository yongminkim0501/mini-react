import { beforeEach, describe, expect, it, vi } from 'vitest';
import pageHtml from '../../index.html?raw';
import { fromDom } from '../core/html-to-vnode';
import { serialize } from '../core/vnode-to-html';
import { DIRTY_CONFIRM, NO_CHANGES, init } from './controller';
import type { Controller } from './controller';
import { formatPatch } from './log';
import { getView } from './view';
import type { View } from './view';

/** index.html의 body를 그대로 jsdom 문서에 올린다 (스크립트는 실행하지 않음). */
function loadPage(): void {
  const parsed = new DOMParser().parseFromString(pageHtml, 'text/html');
  parsed.querySelectorAll('script').forEach((script) => script.remove());
  document.body.replaceChildren(...Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true)));
}

const LOADED = [
  '<h1 class="title">장보기 목록</h1>',
  '<ul>',
  '  <li data-key="a">사과</li>',
  '  <li data-key="b">바나나</li>',
  '</ul>',
].join('\n');

/** 시나리오 2의 사용자 수정: 제목 변경, class에 big 추가, 바나나 → 배, 우유 추가. */
const EDITED = [
  '<h1 class="title big">오늘 장보기</h1>',
  '<ul>',
  '  <li data-key="a">사과</li>',
  '  <li data-key="b">배</li>',
  '  <li data-key="c">우유</li>',
  '</ul>',
].join('\n');

let view: View;
let app: Controller;
let confirmSpy: ReturnType<typeof vi.fn<(message: string) => boolean>>;

/** 정규화 마운트 후에는 요소 사이 공백이 없으므로 텍스트 노드를 모아 비교한다. */
function textNodes(root: Node): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode.nodeValue ?? '');
  return texts;
}

function state() {
  return {
    real: textNodes(view.real).join(' '),
    position: view.position.textContent,
    back: !view.back.disabled,
    forward: !view.forward.disabled,
    log: Array.from(view.log.children, (li) => li.textContent?.split(' ')[0]),
    count: view.count.textContent,
    status: Array.from(view.status.children, (p) => p.textContent),
  };
}

/** 11장: 모든 동작 후 실제 영역 DOM을 다시 읽으면 history.current와 같아야 한다. */
function expectInSync(): void {
  expect(fromDom(view.real).vnode).toEqual(app.history.current);
}

beforeEach(() => {
  loadPage();
  view = getView();
  confirmSpy = vi.fn<(message: string) => boolean>(() => true);
  app = init(view, { confirm: confirmSpy });
});

describe('검증 페이지 9장 시나리오', () => {
  it('1. 페이지 로드: 샘플을 정규화 마운트하고 정리된 코드를 테스트 영역에 넣는다', () => {
    expect(view.test.value).toBe(LOADED);
    expect(state()).toMatchObject({ real: '장보기 목록 사과 바나나', position: '1 / 1', back: false, forward: false, log: [], count: '', status: [] });
    // 주석과 공백 텍스트가 사라져 DOM과 VNode가 1:1로 맞는다.
    expect(Array.from(view.real.childNodes, (n) => n.nodeName)).toEqual(['H1', 'UL']);
    expectInSync();
  });

  it('2. 수정 후 Patch: 4건(PROPS, TEXT, TEXT, CREATE), 변경 부분만 반영한다', () => {
    const firstLi = view.real.querySelector('li');
    const observer = new MutationObserver(() => {});
    observer.observe(view.real, { subtree: true, childList: true, attributes: true, characterData: true });

    view.test.value = EDITED;
    app.onPatch();
    const records = observer.takeRecords();
    observer.disconnect();

    expect(state()).toMatchObject({
      real: '오늘 장보기 사과 배 우유',
      position: '2 / 2',
      back: true,
      forward: false,
      log: ['PROPS', 'TEXT', 'TEXT', 'CREATE'],
      count: 'Patch 4건',
      status: [],
    });
    expect(view.test.value).toBe(EDITED);
    expect(records).toHaveLength(4);
    expect(view.real.querySelector('li')).toBe(firstLi);
    expectInSync();
  });

  it('3. 뒤로가기: 1번 상태로 돌아가고 4건(PROPS, TEXT, TEXT, REMOVE)', () => {
    view.test.value = EDITED;
    app.onPatch();
    view.back.click();

    expect(state()).toMatchObject({
      real: '장보기 목록 사과 바나나',
      position: '1 / 2',
      back: false,
      forward: true,
      log: ['PROPS', 'TEXT', 'TEXT', 'REMOVE'],
      count: 'Patch 4건',
    });
    expect(view.test.value).toBe(LOADED);
    expect(Array.from(view.log.children, (li) => li.textContent)).toEqual([
      'PROPS [0] class="title"',
      'TEXT [0,0] "장보기 목록"',
      'TEXT [1,1,0] "바나나"',
      'REMOVE [1,2]',
    ]);
    expect(confirmSpy).not.toHaveBeenCalled();
    expectInSync();
  });

  it('4. 앞으로가기: 2번과 같은 상태', () => {
    view.test.value = EDITED;
    app.onPatch();
    app.onBack();
    view.forward.click();

    expect(state()).toMatchObject({ real: '오늘 장보기 사과 배 우유', position: '2 / 2', back: true, forward: false, count: 'Patch 4건' });
    expect(view.test.value).toBe(EDITED);
    expectInSync();
  });

  it('5. 아무것도 안 바꾸고 Patch: 변경 사항 없음, 기록 그대로', () => {
    view.test.value = EDITED;
    app.onPatch();
    app.onPatch();

    expect(state()).toMatchObject({ position: '2 / 2', back: true, forward: false, log: [], count: '', status: [NO_CHANGES] });
    expect(app.history.position.total).toBe(2);
  });

  it('6. onerror가 든 img 추가: CREATE 1건, 경고 표시, 알림 없음', () => {
    view.test.value = EDITED;
    app.onPatch();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    view.test.value = `${EDITED}\n<img src=x onerror="alert(1)">`;
    app.onPatch();

    expect(state()).toMatchObject({ position: '3 / 3', back: true, forward: false, log: ['CREATE'], count: 'Patch 1건', status: ['onerror 속성 제거됨'] });
    expect(view.real.querySelector('img')?.hasAttribute('onerror')).toBe(false);
    expect(view.test.value).toBe(`${EDITED}\n<img src="x">`);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    expectInSync();
  });

  it('7. 50만 자 초과: 오류, 실제 영역·테스트 영역·기록 그대로', () => {
    const before = view.real.innerHTML;
    const huge = 'a'.repeat(500_001);
    view.test.value = huge;
    app.onPatch();

    expect(view.real.innerHTML).toBe(before);
    expect(view.test.value).toBe(huge);
    expect(state()).toMatchObject({ position: '1 / 1', back: false, forward: false, log: [] });
    expect(state().status[0]).toMatch(/^입력이 너무 큽니다/);
  });

  it('8. 수정 후 Patch 없이 뒤로가기: 확인 창, 취소하면 이동하지 않음', () => {
    view.test.value = EDITED;
    app.onPatch();
    view.test.value = `${EDITED}\n<p>작성 중</p>`;
    expect(app.isDirty()).toBe(true);

    confirmSpy.mockReturnValueOnce(false);
    app.onBack();
    expect(confirmSpy).toHaveBeenCalledWith(DIRTY_CONFIRM);
    expect(state().position).toBe('2 / 2');
    expect(view.test.value).toContain('작성 중');

    app.onBack();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(state().position).toBe('1 / 2');
    expect(view.test.value).toBe(LOADED);
  });

  it('9. 1 / 3에서 수정 후 Patch: 이후 기록이 지워지고 2 / 2', () => {
    view.test.value = EDITED;
    app.onPatch();
    view.test.value = `${EDITED}\n<p>셋째</p>`;
    app.onPatch();
    app.onBack();
    app.onBack();
    expect(state().position).toBe('1 / 3');

    view.test.value = `${LOADED}\n<p>새 상태</p>`;
    app.onPatch();
    expect(state()).toMatchObject({ real: '장보기 목록 사과 바나나 새 상태', position: '2 / 2', back: true, forward: false });
    app.onBack();
    app.onForward();
    expect(view.real.textContent).toContain('새 상태');
    expect(view.real.textContent).not.toContain('셋째');
    expectInSync();
  });
});

describe('복구와 로그 형식', () => {
  it('Patch 외 DOM 변경으로 대상을 못 찾으면 mount로 복구한다', () => {
    view.real.querySelector('ul')?.remove();
    view.test.value = EDITED;
    app.onPatch();

    expect(state().status).toContain('변경 부분만 반영하지 못해 실제 영역 전체를 다시 그렸습니다.');
    expect(state().position).toBe('2 / 2');
    expectInSync();
  });

  it('formatPatch: 6장 표시 형식', () => {
    const li = fromDom(Object.assign(document.createElement('div'), { innerHTML: '<li data-key="c">x</li>' })).vnode.children[0]!;
    expect(formatPatch({ type: 'PROPS', path: [0], set: { class: 'title big' }, remove: [] })).toBe('PROPS [0] class="title big"');
    expect(formatPatch({ type: 'PROPS', path: [0], set: {}, remove: ['class'] })).toBe('PROPS [0] -class');
    expect(formatPatch({ type: 'TEXT', path: [0, 0], text: '오늘 장보기' })).toBe('TEXT [0,0] "오늘 장보기"');
    expect(formatPatch({ type: 'CREATE', parentPath: [1], index: 1, node: li })).toBe('CREATE [1] 2번째에 <li data-key="c">');
    expect(formatPatch({ type: 'REMOVE', path: [1, 2] })).toBe('REMOVE [1,2]');
    expect(formatPatch({ type: 'REPLACE', path: [2], node: { kind: 'element', tag: 'div', props: {}, children: [] } })).toBe('REPLACE [2] → <div>');
  });

  it('serialize(history.current)와 같으면 수정 상태가 아니다', () => {
    expect(app.isDirty()).toBe(false);
    expect(view.test.value).toBe(serialize(app.history.current!));
  });
});
