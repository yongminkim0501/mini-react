import { afterEach, describe, expect, it, vi } from 'vitest';
import { diff } from '../diff';
import type { EventHandler, PropValue, VElement, VNode } from '../html-to-vnode';
import { applyPatches } from '../patch';
import { serialize } from '../vnode-to-html';
import { getEvent } from './events';
import { mount } from './mount';

function el(tag: string, props: Record<string, PropValue>, children: VNode[] = []): VElement {
  return { kind: 'element', tag, props, children };
}
function root(...children: VNode[]): VElement {
  return el('#root', {}, children);
}
const text = (value: string): VNode => ({ kind: 'text', text: value });

/** 컨테이너에 v0를 마운트하고, 다음 VNode로 diff → applyPatches 하는 도우미. */
function render(v0: VElement) {
  const container = document.createElement('div');
  mount(container, v0);
  let current = v0;
  return {
    container,
    first: () => container.firstElementChild as HTMLElement,
    update(next: VElement) {
      const patches = diff(current, next);
      const result = applyPatches(container, patches);
      expect(result.ok).toBe(true);
      current = next;
      return patches;
    },
  };
}

const addSpy = () => vi.spyOn(Element.prototype, 'addEventListener');

afterEach(() => vi.restoreAllMocks());

describe('이벤트 props 기획서 6장', () => {
  it('6.1 최초 생성: 속성으로 나오지 않고 클릭하면 f1 실행, 등록 1회', () => {
    const spy = addSpy();
    const f1 = vi.fn();
    const r = render(root(el('button', { class: 'btn', onClick: f1 }, [text('추가')])));

    expect(r.container.innerHTML).toBe('<button class="btn">추가</button>');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('click');
    expect(getEvent(r.first(), 'click')).toBe(f1);

    r.first().click();
    expect(f1).toHaveBeenCalledTimes(1);
  });

  it('6.2 함수만 바뀜: PROPS set에 새 함수, 추가 등록 없이 f2만 실행', () => {
    const f1 = vi.fn();
    const f2 = vi.fn();
    const r = render(root(el('button', { class: 'btn', onClick: f1 })));
    const spy = addSpy();

    const patches = r.update(root(el('button', { class: 'btn', onClick: f2 })));
    expect(patches).toEqual([{ type: 'PROPS', path: [0], set: { onClick: f2 }, remove: [] }]);
    expect(spy).not.toHaveBeenCalled();
    expect(getEvent(r.first(), 'click')).toBe(f2);

    r.first().click();
    expect(f1).not.toHaveBeenCalled();
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it('6.3 이벤트 삭제: 클릭해도 아무 함수도 실행되지 않음', () => {
    const f2 = vi.fn();
    const r = render(root(el('button', { onClick: f2 })));
    const patches = r.update(root(el('button', {})));

    expect(patches).toEqual([{ type: 'PROPS', path: [0], set: {}, remove: ['onClick'] }]);
    r.first().click();
    expect(f2).not.toHaveBeenCalled();
    expect(r.first().hasAttribute('onClick')).toBe(false);
  });
});

describe('이벤트 props 기획서 7장', () => {
  it('렌더링 10회(매번 새 함수): 등록 1회, 마지막 함수만 실행', () => {
    const spy = addSpy();
    const calls: number[] = [];
    const make = (i: number): EventHandler => () => calls.push(i);
    const r = render(root(el('button', { onClick: make(0) })));
    for (let i = 1; i < 10; i++) r.update(root(el('button', { onClick: make(i) })));

    expect(spy).toHaveBeenCalledTimes(1);
    r.first().click();
    expect(calls).toEqual([9]);
  });

  it('onClick과 onInput은 종류별로 각각 1회 등록', () => {
    const spy = addSpy();
    render(root(el('input', { onClick: () => {}, onInput: () => {} })));
    expect(spy.mock.calls.map((call) => call[0])).toEqual(['click', 'input']);
  });

  it('onKeyDown은 keydown으로 연결되고 이벤트 객체를 받는다', () => {
    const handler = vi.fn();
    const r = render(root(el('input', { onKeyDown: handler })));
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    r.first().dispatchEvent(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('삭제한 이벤트를 다시 넣으면 재등록 없이 동작', () => {
    const f = vi.fn();
    const r = render(root(el('button', { onClick: f })));
    r.update(root(el('button', {})));
    const spy = addSpy();
    r.update(root(el('button', { onClick: f })));
    expect(spy).not.toHaveBeenCalled();
    r.first().click();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('사용자가 abc 입력 후 value: abc PROPS면 el.value에 대입하지 않는다 (커서 유지)', () => {
    const r = render(root(el('input', { value: '' })));
    const input = r.first() as HTMLInputElement;
    input.value = 'abc';

    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    const sets: string[] = [];
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => proto.get!.call(input),
      set: (v: string) => {
        sets.push(v);
        proto.set!.call(input, v);
      },
    });

    r.update(root(el('input', { value: 'abc' })));
    expect(sets).toEqual([]);
    expect(input.getAttribute('value')).toBe('abc');

    r.update(root(el('input', { value: '' })));
    expect(sets).toEqual(['']);
    expect(input.value).toBe('');
  });

  it('serialize는 함수 props를 출력하지 않는다', () => {
    const v = root(el('button', { class: 'btn', onClick: () => {} }, [text('추가')]));
    expect(serialize(v)).toBe('<button class="btn">추가</button>');
  });
});
