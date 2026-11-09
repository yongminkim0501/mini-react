import { afterEach, describe, expect, it } from 'vitest';
import { diff } from '../diff';
import type { Patch } from '../diff';
import { fromDom, fromHtml } from '../html-to-vnode';
import type { VNode } from '../html-to-vnode';
import { mount } from '../vnode-to-dom';
import { SVG_NAMESPACE } from '../vnode-to-dom';
import { applyPatches } from './applyPatches';

function setup(html: string): HTMLElement {
  document.body.innerHTML = '<div id="real-area" class="area"></div>';
  const container = document.getElementById('real-area');
  if (!container) throw new Error('컨테이너 없음');
  mount(container, fromHtml(html).vnode);
  return container;
}

function observe(container: Element): () => MutationRecord[] {
  const observer = new MutationObserver(() => {});
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
  return () => {
    const records = observer.takeRecords();
    observer.disconnect();
    return records;
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

const SAMPLE = '<h1 class="title">장보기 목록</h1><ul><li data-key="a">사과</li><li data-key="b">바나나</li></ul>';

describe('applyPatches', () => {
  it('6.1 텍스트·속성 변경 + 항목 추가', () => {
    const container = setup(SAMPLE);
    const h1 = container.querySelector('h1');
    const [liA, liB] = Array.from(container.querySelectorAll('li'));
    const liAText = liA?.firstChild;
    const patches: Patch[] = [
      { type: 'PROPS', path: [0], set: { class: 'title big' }, remove: [] },
      { type: 'TEXT', path: [0, 0], text: '오늘 장보기' },
      { type: 'TEXT', path: [1, 1, 0], text: '배' },
      {
        type: 'CREATE',
        parentPath: [1],
        index: 2,
        node: {
          kind: 'element',
          tag: 'li',
          props: { 'data-key': 'c' },
          key: 'c',
          children: [{ kind: 'text', text: '우유' }],
        },
      },
    ];

    const stop = observe(container);
    const result = applyPatches(container, patches);
    const records = stop();

    const liC = container.querySelectorAll('li')[2];
    expect(result).toEqual({ ok: true, changed: [h1, h1, liB, liC] });
    expect(container.outerHTML).toBe(
      '<div id="real-area" class="area"><h1 class="title big">오늘 장보기</h1><ul><li data-key="a">사과</li><li data-key="b">배</li><li data-key="c">우유</li></ul></div>',
    );

    expect(records.map((r) => r.type)).toEqual(['attributes', 'characterData', 'characterData', 'childList']);
    expect(records[0]).toMatchObject({ target: h1, attributeName: 'class' });
    expect(records[3]).toMatchObject({ target: container.querySelector('ul') });
    // 첫 번째 li와 그 텍스트는 변경 0건
    expect(records.some((r) => r.target === liA || r.target === liAText)).toBe(false);
  });

  it('6.2 첫 항목 삭제', () => {
    const container = setup('<ul><li data-key="a">사과</li><li data-key="b">바나나</li></ul>');
    const result = applyPatches(container, [
      { type: 'PROPS', path: [0, 0], set: { 'data-key': 'b' }, remove: [] },
      { type: 'TEXT', path: [0, 0, 0], text: '바나나' },
      { type: 'REMOVE', path: [0, 1] },
    ]);
    expect(result.ok).toBe(true);
    expect(container.innerHTML).toBe('<ul><li data-key="b">바나나</li></ul>');
  });

  it('6.3 경로 불일치면 ok: false, 변경 0건', () => {
    const container = setup(SAMPLE);
    const before = container.innerHTML;
    const stop = observe(container);
    const result = applyPatches(container, [
      { type: 'PROPS', path: [0], set: { class: 'x' }, remove: [] },
      { type: 'TEXT', path: [5], text: 'y' },
    ]);
    expect(result).toEqual({ ok: false, changed: [] });
    expect(stop()).toHaveLength(0);
    expect(container.innerHTML).toBe(before);
  });

  it('대상 종류가 맞지 않아도 ok: false (TEXT를 요소에)', () => {
    const container = setup(SAMPLE);
    const stop = observe(container);
    expect(applyPatches(container, [{ type: 'TEXT', path: [0], text: 'x' }]).ok).toBe(false);
    expect(stop()).toHaveLength(0);
  });

  it('컨테이너 자신(빈 경로)은 수정 대상이 아니다', () => {
    const container = setup(SAMPLE);
    expect(applyPatches(container, [{ type: 'REMOVE', path: [] }]).ok).toBe(false);
    expect(container.isConnected).toBe(true);
  });

  it('빈 Patch 배열은 ok: true, 변경 0건', () => {
    const container = setup(SAMPLE);
    const stop = observe(container);
    expect(applyPatches(container, [])).toEqual({ ok: true, changed: [] });
    expect(stop()).toHaveLength(0);
  });

  it('REMOVE [0]과 TEXT [1, 0]이 함께 있어도 인덱스가 밀리지 않는다', () => {
    const container = setup('<p>a</p><p>b</p>');
    applyPatches(container, [
      { type: 'REMOVE', path: [0] },
      { type: 'TEXT', path: [1, 0], text: 'B' },
    ]);
    expect(container.innerHTML).toBe('<p>B</p>');
  });

  it('REPLACE는 해당 위치만 바꾸고 형제는 같은 객체를 유지한다', () => {
    const container = setup('<span>1</span><p>x</p><span>2</span>');
    const [first, , last] = Array.from(container.childNodes);
    applyPatches(container, [
      {
        type: 'REPLACE',
        path: [1],
        node: { kind: 'element', tag: 'div', props: {}, children: [{ kind: 'text', text: 'x' }] },
      },
    ]);
    expect(container.innerHTML).toBe('<span>1</span><div>x</div><span>2</span>');
    expect(container.childNodes[0]).toBe(first);
    expect(container.childNodes[2]).toBe(last);
  });

  it('SVG 안에 CREATE한 요소는 SVG 네임스페이스다', () => {
    const container = setup('<svg><circle r="1"></circle></svg>');
    applyPatches(container, [
      {
        type: 'CREATE',
        parentPath: [0],
        index: 1,
        node: { kind: 'element', tag: 'rect', props: { width: '1' }, children: [] },
      },
    ]);
    expect(container.querySelector('rect')?.namespaceURI).toBe(SVG_NAMESPACE);
  });

  it('SVG 안에 REPLACE한 요소는 SVG 네임스페이스다', () => {
    const container = setup('<svg><circle r="1"></circle></svg>');
    applyPatches(container, [
      { type: 'REPLACE', path: [0, 0], node: { kind: 'element', tag: 'rect', props: {}, children: [] } },
    ]);
    expect(container.querySelector('rect')?.namespaceURI).toBe(SVG_NAMESPACE);
  });

  it('사용자가 입력한 input에 value PROPS를 반영하면 화면 값이 바뀐다', () => {
    const container = setup('<input value="a">');
    const input = container.querySelector('input');
    if (!input) throw new Error('input 없음');
    input.value = '사용자 입력';
    applyPatches(container, [{ type: 'PROPS', path: [0], set: { value: 'b' }, remove: [] }]);
    expect(input.value).toBe('b');
    expect(input.getAttribute('value')).toBe('b');
  });

  it('value 속성 삭제는 화면 값을 비운다', () => {
    const container = setup('<input value="a">');
    const input = container.querySelector('input');
    if (!input) throw new Error('input 없음');
    input.value = '사용자 입력';
    applyPatches(container, [{ type: 'PROPS', path: [0], set: {}, remove: ['value'] }]);
    expect(input.value).toBe('');
  });

  it('checked 삭제 PROPS는 체크를 해제한다', () => {
    const container = setup('<input type="checkbox" checked>');
    const input = container.querySelector('input');
    if (!input) throw new Error('input 없음');
    input.checked = true; // 사용자가 건드린 상태
    applyPatches(container, [{ type: 'PROPS', path: [0], set: {}, remove: ['checked'] }]);
    expect(input.checked).toBe(false);
  });

  it('checked 설정 PROPS는 사용자가 해제한 체크박스도 체크한다', () => {
    const container = setup('<input type="checkbox">');
    const input = container.querySelector('input');
    if (!input) throw new Error('input 없음');
    input.checked = false;
    applyPatches(container, [{ type: 'PROPS', path: [0], set: { checked: '' }, remove: [] }]);
    expect(input.checked).toBe(true);
  });

  it('selected PROPS는 option 선택을 바꾼다', () => {
    const container = setup('<select><option>a</option><option>b</option></select>');
    const select = container.querySelector('select');
    if (!select) throw new Error('select 없음');
    applyPatches(container, [{ type: 'PROPS', path: [0, 1], set: { selected: '' }, remove: [] }]);
    expect(select.value).toBe('b');
  });

  it('file input의 value PROPS는 예외 없이 속성만 바꾼다', () => {
    const container = setup('<input type="file">');
    expect(() =>
      applyPatches(container, [{ type: 'PROPS', path: [0], set: { value: 'x' }, remove: [] }]),
    ).not.toThrow();
  });
});

describe('diff → applyPatches → fromDom 왕복 검증', () => {
  const CASES: [string, string][] = [
    [SAMPLE, '<h1 class="title big">오늘 장보기</h1><ul><li data-key="a">사과</li><li data-key="b">배</li><li data-key="c">우유</li></ul>'],
    ['<ul><li data-key="a">사과</li><li data-key="b">바나나</li></ul>', '<ul><li data-key="b">바나나</li></ul>'],
    [SAMPLE, '<h1>x</h1>'],
    [SAMPLE, '<p>a</p><ul><li>1</li></ul><div><b>c</b> d</div>'],
    ['<div><p>a</p><p>b</p></div>', '<div><p>a</p>text<span>b</span><i></i></div>'],
    ['<svg><circle r="1"/></svg>', '<svg><circle r="2"/><rect/><foreignObject><div>hi</div></foreignObject></svg>'],
    ['', '<p>new</p>'],
    ['<ul><li>1</li><li>2</li><li>3</li></ul>', '<ul></ul>'],
    ['<p>a <b>b</b> c</p>', '<p>a <i>b</i> c d</p>'],
    ['<input value="a"><input type="checkbox" checked>', '<input value="b" disabled><input type="checkbox">'],
  ];

  it.each(CASES)('%j → %j', (beforeHtml, afterHtml) => {
    const container = setup(beforeHtml);
    const before = fromDom(container).vnode;
    const after = fromHtml(afterHtml).vnode;

    const result = applyPatches(container, diff(before, after));

    expect(result.ok).toBe(true);
    expect(fromDom(container).vnode).toEqual(after);
  });

  it('바뀌지 않은 노드는 같은 DOM 객체 그대로다', () => {
    const container = setup(SAMPLE);
    const h1 = container.querySelector('h1');
    const h1Text = h1?.firstChild;
    const ul = container.querySelector('ul');
    const [liA, liB] = Array.from(container.querySelectorAll('li'));

    const before = fromDom(container).vnode;
    const after = fromHtml('<h1 class="title">장보기 목록</h1><ul><li data-key="a">사과</li><li data-key="b">배</li></ul>').vnode;
    applyPatches(container, diff(before, after));

    const nodes: (Node | null | undefined)[] = [
      container.querySelector('h1'),
      container.querySelector('h1')?.firstChild,
      container.querySelector('ul'),
      container.querySelectorAll('li')[0],
      container.querySelectorAll('li')[1],
    ];
    expect(nodes).toEqual([h1, h1Text, ul, liA, liB]);
    nodes.forEach((node, i) => expect(node).toBe([h1, h1Text, ul, liA, liB][i]));
  });

  it('연속 적용해도 DOM과 VNode가 계속 1:1로 맞는다', () => {
    const container = setup(SAMPLE);
    let current: VNode = fromDom(container).vnode;
    for (const html of ['<p>1</p>', '<p>1</p><p>2</p>', '<div><p>2</p></div>', SAMPLE, '']) {
      const next = fromHtml(html).vnode;
      expect(applyPatches(container, diff(current, next)).ok).toBe(true);
      expect(fromDom(container).vnode).toEqual(next);
      current = next;
    }
  });
});
