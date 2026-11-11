// @vitest-environment node
// h()는 DOM 없이 동작하는 순수 함수다.
import { describe, expect, it } from 'vitest';
import { h } from './h';
import { normalizeChildren, normalizeProps } from './normalize';
import type { ComponentProps } from './types';

describe('h 기획서 6장', () => {
  it('6.1 요소: props 정리, 텍스트 병합, false 자식 버림', () => {
    const v = h('p', { class: 'count', id: 7, hidden: false }, '남은 일: ', 3, '개', false && h('b'));
    expect(v).toEqual({
      kind: 'element',
      tag: 'p',
      props: { class: 'count', id: '7' },
      children: [{ kind: 'text', text: '남은 일: 3개' }],
    });
  });

  it('6.2 리스트와 key: data-key에도 넣는다', () => {
    const v = h('ul', null, ['우유', '빵'].map((t) => h('li', { key: t }, t)));
    expect(v).toEqual({
      kind: 'element',
      tag: 'ul',
      props: {},
      children: [
        { kind: 'element', tag: 'li', props: { 'data-key': '우유' }, key: '우유', children: [{ kind: 'text', text: '우유' }] },
        { kind: 'element', tag: 'li', props: { 'data-key': '빵' }, key: '빵', children: [{ kind: 'text', text: '빵' }] },
      ],
    });
  });

  it('6.3 이벤트와 불리언', () => {
    const add = () => {};
    const v = h('button', { onClick: add, disabled: true }, '추가');
    expect(v).toEqual({
      kind: 'element',
      tag: 'button',
      props: { onClick: add, disabled: '' },
      children: [{ kind: 'text', text: '추가' }],
    });
    expect(v.props.onClick).toBe(add);
  });

  it('6.4 컴포넌트: key 분리, props에 children', () => {
    const TodoItem = (_: ComponentProps<{ item: { text: string } }>) => null;
    const item = { text: '우유' };
    const v = h(TodoItem, { key: 'a', item });
    expect(v).toEqual({ kind: 'component', type: TodoItem, props: { item, children: [] }, key: 'a' });
    expect(v.props.item).toBe(item);
  });
});

describe('h 기획서 7장', () => {
  it('중첩 배열을 펼치고 텍스트를 합친다', () => {
    expect(h('div', null, [[1, [2]], 3]).children).toEqual([{ kind: 'text', text: '123' }]);
  });

  it('null, undefined, true는 자식이 되지 않는다', () => {
    expect(h('div', null, null, undefined, true).children).toEqual([]);
  });

  it('on으로 시작하는 문자열 props는 버린다', () => {
    expect(h('a', { onclick: 'alert(1)' }).props).toEqual({});
  });

  it('checked: true는 빈 문자열', () => {
    expect(h('input', { checked: true }).props.checked).toBe('');
  });

  it('style 객체는 버린다', () => {
    expect(h('div', { style: { color: 'red' } }).props).toEqual({});
  });

  it('반환된 VNode는 동결되어 있다', () => {
    const v = h('ul', { class: 'a' }, h('li', null, 'x'));
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.isFrozen(v.props)).toBe(true);
    expect(Object.isFrozen(v.children)).toBe(true);
    expect(Object.isFrozen(v.children[0])).toBe(true);
    expect(() => {
      (v.props as Record<string, string>).class = 'b';
    }).toThrow(TypeError);
    const c = h((_: ComponentProps<{ n: number }>) => null, { n: 1 });
    expect(Object.isFrozen(c.props)).toBe(true);
  });
});

describe('normalize 경계', () => {
  it('빈 문자열은 버리고, 앞뒤 요소 사이 텍스트만 합친다', () => {
    const b = h('b', null, 'x');
    expect(normalizeChildren(['a', '', 'b', b, 'c', 1])).toEqual([{ kind: 'text', text: 'ab' }, b, { kind: 'text', text: 'c1' }]);
  });

  it('텍스트 VNode도 인접 문자열과 합친다', () => {
    expect(normalizeChildren([{ kind: 'text', text: 'a' }, 'b'])).toEqual([{ kind: 'text', text: 'ab' }]);
  });

  it('일반 객체 자식은 오류', () => {
    expect(() => normalizeChildren([{ a: 1 }])).toThrow(TypeError);
  });

  it('on 이름이 아닌 함수, null, 객체는 버린다', () => {
    expect(normalizeProps({ title: () => {}, a: null, b: undefined, c: [1], d: 0 })).toEqual({ d: '0' });
  });

  it('key는 숫자도 문자열로', () => {
    expect(h('li', { key: 3 })).toMatchObject({ key: '3', props: { 'data-key': '3' } });
  });
});
