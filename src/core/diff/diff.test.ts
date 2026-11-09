// @vitest-environment node
// diff는 DOM 없이 동작해야 하므로 node 환경에서 검증한다.
import { describe, expect, it } from 'vitest';
import type { VElement, VNode } from '../html-to-vnode';
import { diff } from './diff';
import { diffProps } from './diffProps';

function el(tag: string, props: Record<string, string>, children: VNode[] = []): VElement {
  return { kind: 'element', tag, props, children };
}

function text(value: string): VNode {
  return { kind: 'text', text: value };
}

function root(...children: VNode[]): VElement {
  return el('#root', {}, children);
}

describe('diffProps', () => {
  it('같으면 null', () => {
    expect(diffProps({ a: '1' }, { a: '1' })).toBeNull();
  });

  it('새 쪽에만 있거나 값이 다르면 set', () => {
    expect(diffProps({ a: '1' }, { a: '2', b: '3' })).toEqual({ set: { a: '2', b: '3' }, remove: [] });
  });

  it('이전에만 있으면 remove', () => {
    expect(diffProps({ a: '1', b: '2' }, { a: '1' })).toEqual({ set: {}, remove: ['b'] });
  });

  it('빈 문자열 값도 다른 값으로 본다', () => {
    expect(diffProps({ disabled: '' }, { disabled: 'x' })).toEqual({ set: { disabled: 'x' }, remove: [] });
  });

  it('프로토타입 없는 props와 __proto__ 속성 이름을 다룬다', () => {
    const oldProps: Record<string, string> = Object.create(null);
    const newProps: Record<string, string> = Object.create(null);
    newProps['__proto__'] = 'x';
    const result = diffProps(oldProps, newProps);
    expect(Object.keys(result?.set ?? {})).toEqual(['__proto__']);
  });
});

describe('diff', () => {
  it('같은 내용이면 빈 배열', () => {
    const make = () => root(el('ul', { class: 'a' }, [el('li', {}, [text('x')])]));
    expect(diff(make(), make())).toEqual([]);
  });

  it('같은 객체면 하위를 비교하지 않고 빈 배열', () => {
    const v = root(el('p', {}, [text('x')]));
    // 같은 객체는 children을 읽지 않아야 한다.
    const trap = new Proxy(v, {
      get(target, key, receiver) {
        if (key === 'children') throw new Error('하위 비교 발생');
        return Reflect.get(target, key, receiver);
      },
    });
    expect(diff(trap, trap)).toEqual([]);
  });

  it('텍스트 한 글자 변경은 TEXT 1건', () => {
    expect(diff(root(el('p', {}, [text('abc')])), root(el('p', {}, [text('abd')])))).toEqual([
      { type: 'TEXT', path: [0, 0], text: 'abd' },
    ]);
  });

  it('class 값 변경은 PROPS 1건 (set)', () => {
    expect(diff(root(el('p', { class: 'a' })), root(el('p', { class: 'b' })))).toEqual([
      { type: 'PROPS', path: [0], set: { class: 'b' }, remove: [] },
    ]);
  });

  it('속성 삭제는 PROPS 1건 (remove)', () => {
    expect(diff(root(el('p', { title: 't' })), root(el('p', {})))).toEqual([
      { type: 'PROPS', path: [0], set: {}, remove: ['title'] },
    ]);
  });

  it('끝에 항목 추가는 CREATE 1건', () => {
    const li = el('li', {}, [text('2')]);
    expect(
      diff(root(el('ul', {}, [el('li', {}, [text('1')])])), root(el('ul', {}, [el('li', {}, [text('1')]), li]))),
    ).toEqual([{ type: 'CREATE', parentPath: [0], index: 1, node: li }]);
  });

  it('끝 항목 삭제는 REMOVE 1건', () => {
    expect(
      diff(root(el('ul', {}, [el('li', {}, [text('1')]), el('li', {}, [text('2')])])), root(el('ul', {}, [el('li', {}, [text('1')])]))),
    ).toEqual([{ type: 'REMOVE', path: [0, 1] }]);
  });

  it('태그가 다르면 REPLACE 1건, 하위 Patch 없음', () => {
    const div = el('div', { class: 'z' }, [text('y')]);
    expect(diff(root(el('p', {}, [text('x')])), root(div))).toEqual([{ type: 'REPLACE', path: [0], node: div }]);
  });

  it('텍스트가 요소로 바뀌면 REPLACE 1건', () => {
    const b = el('b', {}, [text('x')]);
    expect(diff(root(text('x')), root(b))).toEqual([{ type: 'REPLACE', path: [0], node: b }]);
  });

  it('루트 자식을 전부 지우면 자식 수만큼 REMOVE', () => {
    expect(diff(root(el('h1', {}), text('a'), el('ul', {})), root())).toEqual([
      { type: 'REMOVE', path: [0] },
      { type: 'REMOVE', path: [1] },
      { type: 'REMOVE', path: [2] },
    ]);
  });

  it('부모 먼저, 자식은 인덱스 순으로 담는다', () => {
    const patches = diff(
      root(el('div', { a: '1' }, [text('x'), el('i', { b: '1' })]), text('y')),
      root(el('div', { a: '2' }, [text('X'), el('i', { b: '2' })]), text('Y')),
    );
    expect(patches.map((p) => [p.type, 'path' in p ? p.path : p.parentPath])).toEqual([
      ['PROPS', [0]],
      ['TEXT', [0, 0]],
      ['PROPS', [0, 1]],
      ['TEXT', [1]],
    ]);
  });
});
