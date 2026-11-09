import { afterEach, describe, expect, it } from 'vitest';
import { fromDom, fromHtml } from '../html-to-vnode';
import { mount } from '../vnode-to-dom';
import { serialize } from './serialize';

// fromHtml 기획서 통합 테스트 입력 + 출력 방식 규칙이 걸리는 경계 입력
const INPUTS = [
  '<img src=x onerror="window.__hit=1">',
  `
    <ul>
      <li>1</li>
      <li>2</li>
      <li>3</li>
    </ul>
  `,
  '<b>A</b> <i>B</i>',
  '안녕<!-- -->\n  세상',
  'a<script>x</script>b',
  '<pre>  a\n  b</pre>',
  '<pre>\n\n  a</pre>',
  '<textarea>\n  x < y</textarea>',
  '<DIV CLASS="x"></DIV>',
  '<svg><linearGradient/></svg>',
  '<svg viewBox="0 0 10 10"><circle r="5"/><foreignObject><div>hi <b>x</b></div></foreignObject></svg>',
  '<ul><li data-key="a"></li><li data-key="a"></li></ul>',
  '',
  `<ul class="list   main">
  <li data-key="a" onclick="x()">사과 <b>빨강</b></li>
</ul>
<script>alert(1)</script>
`,
  '<p>a &lt; b &amp; c&nbsp;&nbsp;d</p>',
  '<span title=\'say "hi" &amp; bye\'>t</span>',
  '<input disabled value=""><br><hr>',
  '<p>앞 <b> 굵게 </b> 뒤</p>',
  '<table><tr><td>1</td></tr></table>',
  '<div>\n  <p>문단</p>\n  끝 텍스트\n</div>',
];

describe('왕복 불변식: fromHtml(serialize(v)).vnode == v', () => {
  it.each(INPUTS)('%j', (input) => {
    const v = fromHtml(input).vnode;
    expect(fromHtml(serialize(v)).vnode).toEqual(v);
  });
});

describe('페이지 로드 흐름: fromDom → mount → textarea.value = serialize(v0)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('테스트 영역에 5.1 출력이 표시된다', () => {
    document.body.innerHTML = `<div id="real-area" class="area">
  <h1 class="title">장보기 목록</h1>
  <!-- 샘플 -->
  <ul>
    <li data-key="a">사과</li>
    <li data-key="b">바나나</li>
  </ul>
</div>
<textarea id="test-area"></textarea>`;
    const realArea = document.getElementById('real-area');
    const testArea = document.getElementById('test-area');
    if (!realArea || !(testArea instanceof HTMLTextAreaElement)) throw new Error('영역 없음');

    const v0 = fromDom(realArea).vnode;
    mount(realArea, v0);
    testArea.value = serialize(v0);

    expect(testArea.value).toBe(
      [
        '<h1 class="title">장보기 목록</h1>',
        '<ul>',
        '  <li data-key="a">사과</li>',
        '  <li data-key="b">바나나</li>',
        '</ul>',
      ].join('\n'),
    );
    expect(fromHtml(testArea.value).vnode).toEqual(fromDom(realArea).vnode);
  });
});
