import { describe, expect, it } from 'vitest';
import { fromHtml } from './index';
import { MAX_INPUT_LENGTH, parseToFragment } from './parse';
import type { VElement, VNode } from './types';

function child(node: VNode | undefined, index: number): VNode {
  if (node?.kind !== 'element') throw new Error('element VNode가 아님');
  const found = node.children[index];
  if (!found) throw new Error(`children[${index}] 없음`);
  return found;
}

function tags(node: VElement): string[] {
  return node.children.map((c) => (c.kind === 'element' ? c.tag : `"${c.text}"`));
}

describe('parseToFragment', () => {
  it('template 안에서 파싱해 onerror가 실행되지 않는다', () => {
    const fragment = parseToFragment('<img src=x onerror="window.__hit=1">');
    // template 내용은 브라우징 컨텍스트가 없는 별도 문서에 속한다.
    expect(fragment.ownerDocument).not.toBe(document);
    expect((window as unknown as { __hit?: number }).__hit).toBeUndefined();
  });
});

describe('fromHtml', () => {
  it('들여쓰기 공백은 버려 ul의 자식은 li뿐이다', () => {
    const { vnode } = fromHtml(`
      <ul>
        <li>1</li>
        <li>2</li>
        <li>3</li>
      </ul>
    `);
    expect(tags(child(vnode, 0) as VElement)).toEqual(['li', 'li', 'li']);
  });

  it('인라인 요소 사이 공백 한 칸은 유지한다', () => {
    const { vnode } = fromHtml('<b>A</b> <i>B</i>');
    expect(tags(vnode)).toEqual(['b', '" "', 'i']);
  });

  it('주석을 사이에 둔 텍스트를 하나로 합친다', () => {
    const { vnode } = fromHtml('안녕<!-- -->\n  세상');
    expect(vnode.children).toEqual([{ kind: 'text', text: '안녕 세상' }]);
  });

  it('차단된 요소를 사이에 둔 텍스트를 합치고 경고를 남긴다', () => {
    const { vnode, warnings, ok } = fromHtml('a<script>x</script>b');
    expect(vnode.children).toEqual([{ kind: 'text', text: 'ab' }]);
    expect(warnings.map((w) => w.code)).toEqual(['SANITIZED_ELEMENT']);
    expect(ok).toBe(true);
  });

  it('pre 안의 공백은 그대로 둔다', () => {
    const { vnode } = fromHtml('<pre>  a\n  b</pre>');
    expect(child(vnode, 0)).toMatchObject({ tag: 'pre', children: [{ kind: 'text', text: '  a\n  b' }] });
  });

  it('대문자 태그·속성을 소문자로 읽는다', () => {
    const { vnode } = fromHtml('<DIV CLASS="x"></DIV>');
    expect(child(vnode, 0)).toMatchObject({ tag: 'div', props: { class: 'x' } });
  });

  it('SVG 태그의 대소문자를 보존한다', () => {
    const { vnode } = fromHtml('<svg><linearGradient/></svg>');
    expect(child(child(vnode, 0), 0)).toMatchObject({ tag: 'linearGradient' });
  });

  it('javascript: 링크를 제거한다', () => {
    const { vnode, warnings } = fromHtml('<a href=" JaVa&#x09;Script:alert(1)">x</a>');
    expect(child(vnode, 0)).toMatchObject({ tag: 'a', props: {} });
    expect(warnings.map((w) => w.code)).toEqual(['SANITIZED_ATTR']);
  });

  it('같은 부모 아래 중복 data-key를 경고한다', () => {
    const { warnings } = fromHtml('<ul><li data-key="a"></li><li data-key="a"></li></ul>');
    expect(warnings).toEqual([
      { severity: 'warn', code: 'DUPLICATE_KEY', path: [0, 1], detail: 'data-key="a" 중복' },
    ]);
  });

  it('빈 문자열은 자식 없는 #root다', () => {
    const result = fromHtml('');
    expect(result.vnode).toEqual({ kind: 'element', tag: '#root', props: {}, children: [] });
    expect(result.ok).toBe(true);
  });

  it('한도를 넘으면 파싱하지 않고 ok: false', () => {
    const result = fromHtml('a'.repeat(MAX_INPUT_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.vnode.children).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(['INPUT_TOO_LARGE']);
  });

  it('결과 트리는 동결되어 수정할 수 없다', () => {
    const { vnode } = fromHtml('<p class="a">hi</p>');
    const p = child(vnode, 0) as VElement;
    expect(() => {
      (p as { tag: string }).tag = 'div';
    }).toThrow(TypeError);
    expect(() => {
      (p.props as Record<string, string>).class = 'b';
    }).toThrow(TypeError);
    expect(() => {
      (vnode.children as VNode[]).push({ kind: 'text', text: 'x' });
    }).toThrow(TypeError);
    expect(Object.isFrozen(child(p, 0))).toBe(true);
  });

  it('기획서 6장 예시와 같은 결과를 낸다', () => {
    const result = fromHtml(`<ul class="list   main">
  <li data-key="a" onclick="x()">사과 <b>빨강</b></li>
</ul>
<script>alert(1)</script>
`);
    expect(result.vnode).toEqual({
      kind: 'element',
      tag: '#root',
      props: {},
      children: [
        {
          kind: 'element',
          tag: 'ul',
          props: { class: 'list main' },
          children: [
            {
              kind: 'element',
              tag: 'li',
              props: { 'data-key': 'a' },
              key: 'a',
              children: [
                { kind: 'text', text: '사과 ' },
                { kind: 'element', tag: 'b', props: {}, children: [{ kind: 'text', text: '빨강' }] },
              ],
            },
          ],
        },
      ],
    });
    expect(result.warnings.map((w) => w.code)).toEqual(['SANITIZED_ATTR', 'SANITIZED_ELEMENT']);
    expect(result.ok).toBe(true);
  });
});
