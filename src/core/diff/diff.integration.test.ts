import { describe, expect, it } from 'vitest';
import { fromHtml } from '../html-to-vnode';
import type { VNode } from '../html-to-vnode';
import { diff } from './diff';
import type { Path } from './types';

const BEFORE = `<h1 class="title">장보기 목록</h1>
<ul>
  <li data-key="a">사과</li>
  <li data-key="b">바나나</li>
</ul>`;

function resolve(root: VNode, path: Path): VNode | undefined {
  let node: VNode | undefined = root;
  for (const index of path) {
    node = node?.kind === 'element' ? node.children[index] : undefined;
  }
  return node;
}

describe('diff (fromHtml 결과로 검증)', () => {
  it('7.1 텍스트·속성 변경 + 항목 추가', () => {
    const before = fromHtml(BEFORE).vnode;
    const after = fromHtml(`<h1 class="title big">오늘 장보기</h1>
<ul>
  <li data-key="a">사과</li>
  <li data-key="b">배</li>
  <li data-key="c">우유</li>
</ul>`).vnode;

    expect(diff(before, after)).toEqual([
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
    ]);
  });

  it('7.2 첫 항목 삭제는 인덱스 기반으로 PROPS, TEXT, REMOVE', () => {
    const before = fromHtml(`<ul>
  <li data-key="a">사과</li>
  <li data-key="b">바나나</li>
</ul>`).vnode;
    const after = fromHtml(`<ul>
  <li data-key="b">바나나</li>
</ul>`).vnode;

    expect(diff(before, after)).toEqual([
      { type: 'PROPS', path: [0, 0], set: { 'data-key': 'b' }, remove: [] },
      { type: 'TEXT', path: [0, 0, 0], text: '바나나' },
      { type: 'REMOVE', path: [0, 1] },
    ]);
  });

  it('7.3 변경 없음', () => {
    expect(diff(fromHtml(BEFORE).vnode, fromHtml(BEFORE).vnode)).toEqual([]);
  });

  const CASES: [string, string][] = [
    [BEFORE, '<h1>x</h1>'],
    [BEFORE, '<p>a</p><ul><li>1</li></ul><div><b>c</b> d</div>'],
    ['<div><p>a</p><p>b</p></div>', '<div><p>a</p>text<span>b</span><i></i></div>'],
    ['<svg><circle r="1"/></svg>', '<svg><circle r="2"/><rect/></svg>'],
    ['', '<p>new</p>'],
    ['<ul><li>1</li><li>2</li><li>3</li></ul>', '<ul></ul>'],
  ];

  it.each(CASES)('모든 Patch 경로가 이전 트리에 실제로 존재한다: %j → %j', (beforeHtml, afterHtml) => {
    const before = fromHtml(beforeHtml).vnode;
    const after = fromHtml(afterHtml).vnode;
    const patches = diff(before, after);
    expect(patches.length).toBeGreaterThan(0);

    for (const patch of patches) {
      if (patch.type === 'CREATE') {
        const parent = resolve(before, patch.parentPath);
        expect(parent?.kind).toBe('element');
        // 인덱스 기반이므로 CREATE는 이전 자식 목록의 끝 이후에만 생긴다.
        expect(patch.index).toBeGreaterThanOrEqual(parent?.kind === 'element' ? parent.children.length : 0);
      } else {
        const target = resolve(before, patch.path);
        expect(target).toBeDefined();
        if (patch.type === 'TEXT') expect(target?.kind).toBe('text');
        if (patch.type === 'PROPS') expect(target?.kind).toBe('element');
      }
    }
  });

  it('diff 후에도 입력 VNode는 바뀌지 않는다', () => {
    const before = fromHtml(BEFORE).vnode;
    const after = fromHtml('<h1 class="x">y</h1><p>z</p>').vnode;
    const snapshot = [JSON.stringify(before), JSON.stringify(after)];
    diff(before, after);
    expect([JSON.stringify(before), JSON.stringify(after)]).toEqual(snapshot);
  });
});
