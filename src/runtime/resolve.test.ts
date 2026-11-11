// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { VNode } from '../core/html-to-vnode';
import { h } from './h';
import { MAX_COMPONENT_DEPTH, resolve } from './resolve';
import type { Child, Component, ComponentProps } from './types';

interface Item {
  id: string;
  text: string;
  done: boolean;
}

function TodoItem({ item }: ComponentProps<{ item: Item }>) {
  return h('li', { class: item.done ? 'done' : '' }, item.text);
}

function TodoList({ items }: ComponentProps<{ items: Item[] }>) {
  return h('ul', null, items.map((it) => h(TodoItem, { key: it.id, item: it })));
}

/** 출력 트리에 컴포넌트 VNode가 남아 있는지 */
function hasComponent(node: VNode | { kind: string; children?: readonly unknown[] }): boolean {
  if (node.kind === 'component') return true;
  return 'children' in node && Array.isArray(node.children) ? node.children.some((c) => hasComponent(c as VNode)) : false;
}

describe('resolve 기획서 6장', () => {
  it('컴포넌트를 펼치고 key를 이어받는다', () => {
    const input = h(
      'div',
      null,
      h('h1', null, '할 일'),
      h(TodoList, {
        items: [
          { id: 'a', text: '우유', done: true },
          { id: 'b', text: '빵', done: false },
        ],
      }),
    );

    expect(resolve(input)).toEqual({
      kind: 'element',
      tag: '#root',
      props: {},
      children: [
        {
          kind: 'element',
          tag: 'div',
          props: {},
          children: [
            { kind: 'element', tag: 'h1', props: {}, children: [{ kind: 'text', text: '할 일' }] },
            {
              kind: 'element',
              tag: 'ul',
              props: {},
              children: [
                { kind: 'element', tag: 'li', props: { class: 'done', 'data-key': 'a' }, key: 'a', children: [{ kind: 'text', text: '우유' }] },
                { kind: 'element', tag: 'li', props: { class: '', 'data-key': 'b' }, key: 'b', children: [{ kind: 'text', text: '빵' }] },
              ],
            },
          ],
        },
      ],
    });
  });
});

describe('resolve 기획서 7장', () => {
  it('null을 반환하면 그 자리에 아무것도 없다', () => {
    const Empty = () => null;
    expect(resolve(h('div', null, 'a', h(Empty), h('b'))).children[0]).toMatchObject({
      children: [{ kind: 'text', text: 'a' }, { kind: 'element', tag: 'b' }],
    });
  });

  it('배열을 반환하면 부모 자식 목록에 펼쳐진다', () => {
    const Pair = () => [h('li', null, '1'), h('li', null, '2')];
    const out = resolve(h('ul', null, h('li', null, '0'), h(Pair), h('li', null, '3')));
    const ul = out.children[0] as unknown as { children: { children: { text: string }[] }[] };
    expect(ul.children.map((li) => li.children[0]!.text)).toEqual(['0', '1', '2', '3']);
  });

  it('숫자를 반환하는 컴포넌트 앞뒤 텍스트가 하나로 합쳐진다', () => {
    const Count: Component<{ n: number }> = ({ n }) => n;
    expect(resolve(h('p', null, '총 ', h(Count, { n: 3 }), '개')).children[0]).toEqual({
      kind: 'element',
      tag: 'p',
      props: {},
      children: [{ kind: 'text', text: '총 3개' }],
    });
  });

  it('컴포넌트 3단계 중첩도 모두 펼친다', () => {
    const C: Component<{ v: string }> = ({ v }) => h('i', null, v);
    const B: Component<{ v: string }> = ({ v }) => h('b', null, h(C, { v }));
    const A: Component<{ v: string }> = ({ v }) => h('span', null, h(B, { v }));
    const out = resolve(h(A, { v: 'x' }));
    expect(out.children).toEqual([
      { kind: 'element', tag: 'span', props: {}, children: [{ kind: 'element', tag: 'b', props: {}, children: [{ kind: 'element', tag: 'i', props: {}, children: [{ kind: 'text', text: 'x' }] }] }] },
    ]);
    expect(hasComponent(out)).toBe(false);
  });

  it('props.children으로 받은 자식을 그대로 그린다', () => {
    const Card = ({ children }: ComponentProps<{}>) => h('section', null, children);
    const out = resolve(h(Card, null, h('h2', null, '제목'), '본문'));
    expect(out.children[0]).toMatchObject({ tag: 'section', children: [{ tag: 'h2' }, { kind: 'text', text: '본문' }] });
  });

  it('자식에서 props를 고치면 동결되어 실패한다', () => {
    const Bad = (props: ComponentProps<{ item: string }>) => {
      (props as { item: string }).item = '변경';
      return null;
    };
    expect(() => resolve(h(Bad, { item: '원래' }))).toThrow(TypeError);
  });

  it('출력 트리는 동결되어 있고 컴포넌트 VNode가 없다', () => {
    const out = resolve(h(TodoList, { items: [{ id: 'a', text: '우유', done: false }] }));
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out.children)).toBe(true);
    expect(Object.isFrozen(out.children[0])).toBe(true);
    expect(hasComponent(out)).toBe(false);
  });

  it('컴포넌트가 여러 노드를 반환하면 key는 무시한다', () => {
    const Two = () => [h('li', null, 'a'), h('li', null, 'b')];
    const out = resolve(h('ul', null, h(Two, { key: 'k' })));
    expect((out.children[0] as unknown as { children: { key?: string }[] }).children.every((li) => li.key === undefined)).toBe(true);
  });

  it(`자기 자신을 반환하면 ${MAX_COMPONENT_DEPTH}단계에서 오류`, () => {
    const Loop = (): Child => h(Loop, null);
    expect(() => resolve(h(Loop, null))).toThrow(/중첩/);
  });
});
