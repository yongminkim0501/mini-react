import { afterEach, describe, expect, it } from 'vitest';
import { fromDom, fromHtml } from '../html-to-vnode';
import type { VElement, VNode } from '../html-to-vnode';
import { createDom } from './createDom';
import { mount } from './mount';
import { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE } from './namespace';

const SAMPLE = `<div id="real-area" class="area">
  <h1 class="title">장보기 목록</h1>
  <!-- 샘플 -->
  <ul>
    <li data-key="a">사과</li>
    <li data-key="b">바나나</li>
  </ul>
</div>`;

const EXPECTED_VNODE: VElement = {
  kind: 'element',
  tag: '#root',
  props: {},
  children: [
    {
      kind: 'element',
      tag: 'h1',
      props: { class: 'title' },
      children: [{ kind: 'text', text: '장보기 목록' }],
    },
    {
      kind: 'element',
      tag: 'ul',
      props: {},
      children: [
        {
          kind: 'element',
          tag: 'li',
          props: { 'data-key': 'a' },
          key: 'a',
          children: [{ kind: 'text', text: '사과' }],
        },
        {
          kind: 'element',
          tag: 'li',
          props: { 'data-key': 'b' },
          key: 'b',
          children: [{ kind: 'text', text: '바나나' }],
        },
      ],
    },
  ],
};

function mountSample(html = SAMPLE): HTMLElement {
  document.body.innerHTML = html;
  const container = document.body.firstElementChild;
  if (!(container instanceof HTMLElement)) throw new Error('컨테이너 없음');
  return container;
}

function el(tag: string, props: Record<string, string>, children: VNode[] = []): VElement {
  return { kind: 'element', tag, props, children };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createDom', () => {
  it('텍스트를 글자 그대로 담은 Text 노드 하나로 만든다', () => {
    const node = createDom({ kind: 'text', text: '<script>alert(1)</script>' });
    expect(node).toBeInstanceOf(Text);
    expect(node.data).toBe('<script>alert(1)</script>');

    const host = document.createElement('div');
    host.appendChild(node);
    expect(host.childNodes).toHaveLength(1);
    expect(host.querySelector('script')).toBeNull();
  });

  it('svg 안의 요소를 SVG 네임스페이스로 만든다', () => {
    const svg = createDom(el('svg', {}, [el('circle', { r: '5' })])) as Element;
    expect(svg.namespaceURI).toBe(SVG_NAMESPACE);
    expect(svg.firstElementChild?.namespaceURI).toBe(SVG_NAMESPACE);
  });

  it('foreignObject 안의 요소는 다시 HTML 네임스페이스다', () => {
    const svg = createDom(el('svg', {}, [el('foreignObject', {}, [el('div', {})])])) as Element;
    const foreignObject = svg.firstElementChild;
    expect(foreignObject?.namespaceURI).toBe(SVG_NAMESPACE);
    expect(foreignObject?.firstElementChild?.namespaceURI).toBe(HTML_NAMESPACE);
    expect(foreignObject?.firstElementChild).toBeInstanceOf(HTMLDivElement);
  });

  it('math 안의 요소를 MathML 네임스페이스로 만든다', () => {
    const math = createDom(el('math', {}, [el('mi', {})])) as Element;
    expect(math.namespaceURI).toBe(MATHML_NAMESPACE);
    expect(math.firstElementChild?.namespaceURI).toBe(MATHML_NAMESPACE);
  });

  it('SVG 태그의 대소문자를 보존한다', () => {
    const svg = createDom(el('svg', {}, [el('linearGradient', {})])) as Element;
    expect(svg.firstElementChild?.localName).toBe('linearGradient');
  });

  it('value 속성이 입력칸에 반영된다', () => {
    const input = createDom(el('input', { value: 'a' })) as HTMLInputElement;
    expect(input.value).toBe('a');
  });

  it('속성을 props 순서대로 설정한다', () => {
    const node = createDom(el('a', { href: '/x', class: 'c', title: 't', 'data-key': 'k' })) as Element;
    expect(node.getAttributeNames()).toEqual(['href', 'class', 'title', 'data-key']);
  });

  it('자식 없는 #root는 빈 DocumentFragment다', () => {
    const node = createDom(el('#root', {}));
    expect(node).toBeInstanceOf(DocumentFragment);
    expect(node.childNodes).toHaveLength(0);
  });

  it('동결된 VNode로도 오류 없이 만들고 VNode를 바꾸지 않는다', () => {
    const { vnode } = fromHtml('<ul class="a"><li data-key="x">1</li></ul>');
    const before = JSON.stringify(vnode);
    expect(() => createDom(vnode)).not.toThrow();
    expect(JSON.stringify(vnode)).toBe(before);
    expect(Object.isFrozen(vnode)).toBe(true);
  });
});

describe('mount', () => {
  it('기획서 5장 입력을 5장 출력으로 마운트한다', () => {
    const container = mountSample();
    mount(container, EXPECTED_VNODE);
    expect(container.outerHTML).toBe(
      '<div id="real-area" class="area"><h1 class="title">장보기 목록</h1><ul><li data-key="a">사과</li><li data-key="b">바나나</li></ul></div>',
    );
    expect(container.childNodes).toHaveLength(2);
    expect(container.querySelector('ul')?.childNodes).toHaveLength(2);
  });

  it('자식 없는 #root를 마운트하면 컨테이너가 비고 속성은 남는다', () => {
    const container = mountSample();
    mount(container, el('#root', {}));
    expect(container.childNodes).toHaveLength(0);
    expect(container.id).toBe('real-area');
    expect(container.className).toBe('area');
  });
});

describe('페이지 로드 흐름: fromDom → mount', () => {
  it('마운트 후 다시 읽으면 v0과 같다 (왕복 검증)', () => {
    const container = mountSample();
    const v0 = fromDom(container).vnode;
    mount(container, v0);
    expect(fromDom(container).vnode).toEqual(v0);
    expect(v0).toEqual(EXPECTED_VNODE);
  });

  it('마운트 후 경로 [1, 0]이 DOM과 VNode에서 같은 li를 가리킨다', () => {
    const container = mountSample();
    const v0 = fromDom(container).vnode;
    mount(container, v0);

    const domNode = container.childNodes[1]?.childNodes[0];
    const ul = v0.children[1];
    const vnode = ul?.kind === 'element' ? ul.children[0] : undefined;

    expect(domNode).toBeInstanceOf(HTMLLIElement);
    expect((domNode as Element).getAttribute('data-key')).toBe('a');
    expect(vnode).toMatchObject({ tag: 'li', key: 'a' });
  });

  it('마운트 전에는 공백·주석 때문에 경로가 어긋난다', () => {
    const container = mountSample();
    expect(container.childNodes[1]).not.toBeInstanceOf(HTMLUListElement);
  });
});
