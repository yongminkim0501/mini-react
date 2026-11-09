// @vitest-environment node
// serialize는 DOM 없이 동작해야 하므로 node 환경에서 검증한다.
import { describe, expect, it } from 'vitest';
import type { VElement, VNode } from '../html-to-vnode';
import { escapeAttr, escapeText } from './escape';
import { isInlineLayout, isPreserve, isVoid } from './rules';
import { serialize } from './serialize';

function el(tag: string, props: Record<string, string>, children: VNode[] = [], key?: string): VElement {
  return key === undefined ? { kind: 'element', tag, props, children } : { kind: 'element', tag, props, children, key };
}

function text(value: string): VNode {
  return { kind: 'text', text: value };
}

function root(children: VNode[]): VElement {
  return el('#root', {}, children);
}

describe('escape', () => {
  it('텍스트의 &, <, >, nbsp를 바꾼다', () => {
    expect(escapeText('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    expect(escapeText('a b')).toBe('a&nbsp;b');
  });

  it('&amp;를 두 번 바꾸지 않는다', () => {
    expect(escapeText('&lt;')).toBe('&amp;lt;');
  });

  it('속성값의 &, "를 바꾼다', () => {
    expect(escapeAttr('say "hi" & bye')).toBe('say &quot;hi&quot; &amp; bye');
  });
});

describe('rules', () => {
  it('void 요소를 판정한다', () => {
    expect(isVoid('br')).toBe(true);
    expect(isVoid('input')).toBe(true);
    expect(isVoid('div')).toBe(false);
  });

  it('공백 보존 요소를 판정한다', () => {
    expect(isPreserve('pre')).toBe(true);
    expect(isPreserve('textarea')).toBe(true);
    expect(isPreserve('div')).toBe(false);
  });

  it('텍스트 자식이 있으면 인라인이다', () => {
    expect(isInlineLayout(el('p', {}, [el('b', {}), text(' ')]))).toBe(true);
    expect(isInlineLayout(el('ul', {}, [el('li', {})]))).toBe(false);
  });
});

describe('serialize', () => {
  it('5.1 fromDom 결과를 블록으로 들여쓴다', () => {
    const vnode = root([
      el('h1', { class: 'title' }, [text('장보기 목록')]),
      el('ul', {}, [
        el('li', { 'data-key': 'a' }, [text('사과')], 'a'),
        el('li', { 'data-key': 'b' }, [text('바나나')], 'b'),
      ]),
    ]);
    expect(serialize(vnode)).toBe(
      [
        '<h1 class="title">장보기 목록</h1>',
        '<ul>',
        '  <li data-key="a">사과</li>',
        '  <li data-key="b">바나나</li>',
        '</ul>',
      ].join('\n'),
    );
  });

  it('5.2 텍스트가 섞인 자식은 한 줄로 쓴다', () => {
    const vnode = root([
      el('ul', { class: 'list main' }, [
        el('li', { 'data-key': 'a' }, [text('사과 '), el('b', {}, [text('빨강')])], 'a'),
      ]),
    ]);
    expect(serialize(vnode)).toBe(
      ['<ul class="list main">', '  <li data-key="a">사과 <b>빨강</b></li>', '</ul>'].join('\n'),
    );
  });

  it('인라인 요소의 하위는 모두 한 줄이다', () => {
    const vnode = root([el('p', {}, [el('b', {}, [text('A')]), text(' '), el('i', {}, [text('B')])])]);
    expect(serialize(vnode)).toBe('<p><b>A</b> <i>B</i></p>');
  });

  it('텍스트를 이스케이프한다', () => {
    expect(serialize(root([text('a < b & c')]))).toBe('a &lt; b &amp; c');
    expect(serialize(root([text('a b')]))).toBe('a&nbsp;b');
  });

  it('속성값을 큰따옴표로 감싸고 이스케이프한다', () => {
    expect(serialize(el('span', { title: 'say "hi"' }))).toBe('<span title="say &quot;hi&quot;"></span>');
  });

  it('빈 속성값은 이름만 쓴다', () => {
    expect(serialize(el('input', { disabled: '' }))).toBe('<input disabled>');
  });

  it('void 요소는 닫는 태그를 쓰지 않는다', () => {
    expect(serialize(el('br', {}))).toBe('<br>');
  });

  it('SVG 요소는 닫는 태그를 쓴다', () => {
    expect(serialize(el('svg', {}, [el('circle', { r: '5' })]))).toBe('<svg>\n  <circle r="5"></circle>\n</svg>');
  });

  it('pre 첫 줄바꿈 앞에 줄바꿈을 하나 더 넣는다', () => {
    expect(serialize(el('pre', {}, [text('\n  a')]))).toBe('<pre>\n\n  a</pre>');
  });

  it('pre 안은 자식이 요소뿐이어도 들여쓰지 않는다', () => {
    expect(serialize(el('pre', {}, [el('b', {}, [text('x')]), el('i', {})]))).toBe('<pre><b>x</b><i></i></pre>');
  });

  it('자식 없는 #root는 빈 문자열이다', () => {
    expect(serialize(root([]))).toBe('');
  });

  it('깊게 중첩된 블록을 단계마다 2칸씩 들여쓴다', () => {
    const vnode = root([el('div', {}, [el('section', {}, [el('p', {}, [text('x')])])])]);
    expect(serialize(vnode)).toBe(
      ['<div>', '  <section>', '    <p>x</p>', '  </section>', '</div>'].join('\n'),
    );
  });
});
