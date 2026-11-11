import { afterEach, describe, expect, it } from 'vitest';
import { fromDom, fromHtml } from './index';

const SAMPLE = `<div id="real-area" class="area">
  <h1 class="title">장보기 목록</h1>
  <!-- 샘플 -->
  <ul>
    <li data-key="a">사과</li>
    <li data-key="b">바나나</li>
  </ul>
</div>`;

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const container = document.body.firstElementChild;
  if (!(container instanceof HTMLElement)) throw new Error('컨테이너 없음');
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('fromDom', () => {
  it('기획서 7장 입력을 7장 출력으로 바꾼다', () => {
    const result = fromDom(mount(SAMPLE));
    expect(result).toEqual({
      vnode: {
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
      },
      warnings: [],
      ok: true,
    });
  });

  it('컨테이너의 id, class는 루트 props에 넣지 않는다', () => {
    const { vnode } = fromDom(mount(SAMPLE));
    expect(Object.keys(vnode.props)).toEqual([]);
  });

  it('들여쓰기 공백과 주석을 버린다', () => {
    const { vnode } = fromDom(mount(SAMPLE));
    expect(vnode.children.every((c) => c.kind === 'element')).toBe(true);
    expect(vnode.children.map((c) => (c.kind === 'element' ? c.tag : c.text))).toEqual(['h1', 'ul']);
  });

  it('변환 중 DOM을 수정하지 않는다', () => {
    const container = mount(SAMPLE);
    const observer = new MutationObserver(() => {});
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    fromDom(container);
    const records = observer.takeRecords();
    observer.disconnect();
    expect(records).toHaveLength(0);
  });

  it('같은 컨테이너의 innerHTML을 fromHtml로 바꾼 결과와 같다', () => {
    const container = mount(SAMPLE);
    expect(fromHtml(container.innerHTML)).toEqual(fromDom(container));
  });

  it('인접한 텍스트 노드를 하나로 합친다', () => {
    const container = mount('<div></div>');
    container.appendChild(document.createTextNode('안녕'));
    container.appendChild(document.createTextNode(' 세상'));
    expect(container.childNodes).toHaveLength(2);
    expect(fromDom(container).vnode.children).toEqual([{ kind: 'text', text: '안녕 세상' }]);
  });

  it('사용자 입력값이 아니라 value 속성을 읽는다', () => {
    const container = mount('<div><input value="a"></div>');
    const input = container.querySelector('input');
    if (!input) throw new Error('input 없음');
    input.value = 'b';
    const { vnode } = fromDom(container);
    expect(vnode.children[0]).toMatchObject({ tag: 'input', props: { value: 'a' } });
  });

  it('실제 영역에도 보안 필터를 적용한다', () => {
    const container = mount('<div><img src="x.png" onerror="window.__hit=1"></div>');
    const { vnode, warnings } = fromDom(container);
    expect(vnode.children[0]).toMatchObject({ tag: 'img', props: { src: 'x.png' } });
    expect(vnode.children[0]).not.toHaveProperty(['props', 'onerror']);
    expect(warnings.map((w) => w.code)).toEqual(['SANITIZED_ATTR']);
  });

  it('빈 컨테이너는 자식 없는 #root다', () => {
    const result = fromDom(mount('<div></div>'));
    expect(result.vnode).toEqual({ kind: 'element', tag: '#root', props: {}, children: [] });
    expect(result.ok).toBe(true);
  });

  it('DocumentFragment는 그대로 루트로 쓴다', () => {
    const template = document.createElement('template');
    template.innerHTML = '<p>a</p>b';
    expect(fromDom(template.content).vnode.children).toEqual([
      { kind: 'element', tag: 'p', props: {}, children: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', text: 'b' },
    ]);
  });
});
