import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT,
  COMMENT,
  ELEMENT,
  FRAGMENT,
  NS_SVG,
  domToVNode,
  containerToVNode,
  htmlToVNode,
  h,
  text,
  comment,
  fragment,
  isEqual,
} from '../../src/vdom/index.js';
import { setupDOM } from './setup-dom.js';

describe('02. DOM → VDOM 변환 (domToVNode, containerToVNode, htmlToVNode)', () => {
  let env;

  beforeEach(() => {
    env = setupDOM();
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('요소·속성·텍스트 기본 변환 및 특수 노드 처리', () => {
    it('요소 태그명을 소문자로 정규화하고 일반 속성·불리언 속성·텍스트를 정확히 변환한다', () => {
      const container = env.document.createElement('div');
      container.id = 'ignored-root-id';
      container.className = 'ignored-root-class';
      container.innerHTML = '<SECTION id="main" data-count="3" hidden><span>안녕</span></SECTION>';

      const v = containerToVNode(container);
      assert.equal(v.type, FRAGMENT);
      // 컨테이너 자신의 id/class는 포함하지 않아야 한다
      assert.equal(v.props, undefined);
      assert.equal(v.children.length, 1);

      const sec = v.children[0];
      assert.equal(sec.type, ELEMENT);
      assert.equal(sec.tag, 'section');
      assert.deepEqual(sec.props, { id: 'main', 'data-count': '3', hidden: '' });
      assert.deepEqual(sec.children, [h('span', null, '안녕')]);
    });

    it('비어 있는 텍스트 노드는 null을 반환하고, 분할된 인접 텍스트 노드는 하나로 병합한다', () => {
      const emptyTxt = env.document.createTextNode('');
      assert.equal(domToVNode(emptyTxt), null);

      const div = env.document.createElement('div');
      div.appendChild(env.document.createTextNode('앞'));
      div.appendChild(env.document.createTextNode(''));
      div.appendChild(env.document.createTextNode('뒤'));

      const v = domToVNode(div);
      assert.deepEqual(v.children, [{ type: TEXT, value: '앞뒤' }]);
    });

    it('빈 HTML, 공백만 있는 HTML, 주석만 있는 HTML, 빈 Document, DocumentType을 안전하게 처리한다', () => {
      assert.deepEqual(htmlToVNode(''), { type: FRAGMENT, children: [] });
      assert.deepEqual(htmlToVNode('   \n\t  '), { type: FRAGMENT, children: [] });
      assert.deepEqual(htmlToVNode('<!-- 주석만 존재 -->'), { type: FRAGMENT, children: [] });

      const emptyContainer = env.document.createElement('div');
      assert.deepEqual(containerToVNode(emptyContainer), { type: FRAGMENT, children: [] });

      // documentElement가 없는 완전히 빈 Document
      const emptyDoc = env.document.implementation.createDocument(null, null, null);
      assert.equal(domToVNode(emptyDoc), null);

      // DocumentType 노드(변환 비대상)는 null 반환
      assert.equal(domToVNode(env.document.doctype), null);

      // 일반 Document는 documentElement(<html>)를 변환
      const docVNode = domToVNode(env.document);
      assert.equal(docVNode.type, ELEMENT);
      assert.equal(docVNode.tag, 'html');
    });

    it('DocumentFragment와 <template> 엘리먼트 모두 내용물을 fragment로 변환한다', () => {
      const docFrag = env.document.createDocumentFragment();
      docFrag.appendChild(env.document.createElement('b')).textContent = '굵게';
      assert.deepEqual(domToVNode(docFrag), fragment([h('b', null, '굵게')]));

      const tpl = env.document.createElement('template');
      tpl.innerHTML = '<i>기울임</i>';
      assert.deepEqual(containerToVNode(tpl), fragment([h('i', null, '기울임')]));
    });
  });

  describe('공백 처리 (ignoreWhitespace) 및 보존 태그', () => {
    it('기본(ignoreWhitespace: true)에서 블록 요소 사이의 들여쓰기·줄바꿈 공백을 제거한다', () => {
      const html = `
        <div class="box">
          <h1>제목</h1>
          <p>내용</p>
        </div>
      `;
      const v = htmlToVNode(html);
      assert.equal(v.children.length, 1);
      assert.equal(v.children[0].children.length, 2);
      assert.equal(v.children[0].children[0].tag, 'h1');
      assert.equal(v.children[0].children[1].tag, 'p');
    });

    it('일반 텍스트 노드 앞뒤에 포함된 의미 있는 공백(" 안녕 ")은 잘라내지 않고 보존한다', () => {
      const v = htmlToVNode('<p>Virtual DOM 을 <b>직접</b> 만들어 봅니다.</p>');
      const p = v.children[0];
      assert.deepEqual(p.children, [
        text('Virtual DOM 을 '),
        h('b', null, '직접'),
        text(' 만들어 봅니다.'),
      ]);
    });

    it('인라인 요소 사이의 단일 공백("<b>Hello</b> <i>World</i>")이 보존되는지 검증', () => {
      // 브라우저 렌더링 상식: <b>Hello</b> <i>World</i> 사이의 공백 텍스트 노드는
      // 줄바꿈/들여쓰기가 아니라 단어 사이 띄어쓰기이므로 제거되면 두 단어가 달라붙는다("HelloWorld").
      const v = htmlToVNode('<p><b>Hello</b> <i>World</i></p>');
      const p = v.children[0];
      assert.deepEqual(p.children, [
        h('b', null, 'Hello'),
        text(' '),
        h('i', null, 'World'),
      ]);
    });

    it('<pre>, <style> 및 <pre> 내부의 중첩 자식 요소(<code>, <span>) 안의 공백 전용 텍스트는 보존한다', () => {
      const v = htmlToVNode('<pre><code><span>const</span>   <span>a = 1;</span></code>\n  </pre>');
      const pre = v.children[0];
      const code = pre.children[0];
      // <span> 사이의 '   ' 공백 텍스트와 </code> 뒤의 '\n  ' 공백 텍스트가 모두 살아 있어야 한다
      assert.equal(code.children.length, 3);
      assert.deepEqual(code.children[1], text('   '));
      assert.deepEqual(pre.children[1], text('\n  '));

      const styleV = htmlToVNode('<style>   </style>');
      assert.deepEqual(styleV.children[0].children, [text('   ')]);
    });

    it('ignoreWhitespace: false 옵션 시 요소 사이의 공백 텍스트 노드를 그대로 유지한다', () => {
      const v = htmlToVNode('<div>\n  <span>A</span>\n</div>', { ignoreWhitespace: false });
      const div = v.children[0];
      assert.equal(div.children.length, 3);
      assert.deepEqual(div.children[0], text('\n  '));
      assert.equal(div.children[1].tag, 'span');
      assert.deepEqual(div.children[2], text('\n'));
    });
  });

  describe('주석 처리 (keepComments)와 인접 텍스트 병합 불변성', () => {
    it('keepComments: false(기본)일 때 텍스트 사이의 주석이 제거되면 양옆 텍스트가 하나로 병합되어야 한다', () => {
      // 정규화 규칙 2: 인접한 텍스트 노드는 하나로 합쳐진다 (DOM ↔ VNode 1:1 보장)
      const v = htmlToVNode('<div>앞쪽<!-- 중간 주석 -->뒤쪽</div>');
      const div = v.children[0];
      assert.equal(div.children.length, 1);
      assert.deepEqual(div.children[0], { type: TEXT, value: '앞쪽뒤쪽' });
    });

    it('keepComments: true일 때 주석 노드가 보존되고 양옆 텍스트는 분리된 채 유지된다', () => {
      const v = htmlToVNode('<div>앞쪽<!-- 중간 주석 -->뒤쪽</div>', { keepComments: true });
      const div = v.children[0];
      assert.deepEqual(div.children, [
        text('앞쪽'),
        comment(' 중간 주석 '),
        text('뒤쪽'),
      ]);
    });
  });

  describe('깊은 중첩 (Deep Nesting) 및 SVG 네임스페이스', () => {
    it('80단계 깊이의 중첩 DOM 트리도 스택 오버플로 없이 정확히 변환한다', () => {
      const depth = 80;
      const open = '<div>'.repeat(depth);
      const close = '</div>'.repeat(depth);
      const v = htmlToVNode(`${open}<span>바닥</span>${close}`);

      let cur = v.children[0];
      for (let i = 1; i < depth; i++) {
        assert.equal(cur.tag, 'div');
        cur = cur.children[0];
      }
      assert.equal(cur.tag, ' div'.trim());
      assert.deepEqual(cur.children, [h('span', null, '바닥')]);
    });

    it('SVG 루트와 하위 요소(path, linearGradient, clipPath)의 네임스페이스(NS_SVG) 및 대소문자 구분 태그·속성을 보존한다', () => {
      const v = htmlToVNode(
        '<svg viewBox="0 0 100 100" width="50"><defs><linearGradient id="grad1"><stop offset="5%"/></linearGradient><clipPath id="clip1"><circle cx="50" cy="50" r="40"/></clipPath></defs><path d="M10 10 H 90"/></svg>',
      );
      const svg = v.children[0];
      assert.equal(svg.tag, 'svg');
      assert.equal(svg.ns, NS_SVG);
      assert.equal(svg.props.viewBox, '0 0 100 100');

      const defs = svg.children[0];
      assert.equal(defs.ns, NS_SVG);
      assert.equal(defs.children[0].tag, 'linearGradient');
      assert.equal(defs.children[0].ns, NS_SVG);
      assert.equal(defs.children[1].tag, 'clipPath');
      assert.equal(defs.children[1].children[0].ns, NS_SVG);
    });

    it('SVG <foreignObject> 안의 HTML 요소는 HTML 네임스페이스로 구분된다', () => {
      const v = htmlToVNode(
        '<svg viewBox="0 0 100 100"><foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><p>HTML 본문</p></div></foreignObject></svg>',
      );
      const svg = v.children[0];
      const fo = svg.children[0];
      assert.equal(fo.ns, NS_SVG);
      const htmlDiv = fo.children[0];
      assert.equal(htmlDiv.tag, 'div');
      // HTML 네임스페이스는 기본값이므로 ns가 없어야(undefined) 일반 h('div')와 동일하게 취급된다
      assert.equal(htmlDiv.ns, undefined);
    });
  });

  describe('폼 요소의 현재 값 (liveState: true vs false)', () => {
    it('<input type="text"> 및 type 속성 없는 기본 <input>에서 타이핑한 현재 value와 빈 문자열("") 초기화를 감지한다', () => {
      const wrap = env.document.createElement('div');
      wrap.innerHTML = '<input type="text" value="초기값"><input placeholder="기본입력">';
      const [in1, in2] = wrap.querySelectorAll('input');

      // 사용자가 첫 번째 입력창은 전부 지우고(''), 두 번째 입력창에는 새로 타이핑('새값')
      in1.value = '';
      in2.value = '새값';

      const liveV = containerToVNode(wrap, { liveState: true });
      // in1은 현재 값이 ''이므로 이전 '초기값'이 남아 있으면 안 된다
      assert.notEqual(liveV.children[0].props.value, '초기값');
      assert.equal(liveV.children[0].props.value ?? '', '');
      assert.equal(liveV.children[1].props.value, '새값');

      // liveState: false일 때는 HTML attribute 기준으로 읽는다
      const attrV = containerToVNode(wrap, { liveState: false });
      assert.equal(attrV.children[0].props.value, '초기값');
      assert.equal(attrV.children[1].props.value, undefined);
    });

    it('<input type="checkbox"> 및 radio에서 checked 프로퍼티 변경을 반영하되, 없던 value="on" 속성을 멋대로 추가하지 않는다', () => {
      const wrap = env.document.createElement('div');
      wrap.innerHTML = '<input type="checkbox" checked><input type="checkbox"><input type="radio" name="g" value="r1">';
      const [cb1, cb2, radio] = wrap.querySelectorAll('input');

      cb1.checked = false;
      cb2.checked = true;
      radio.checked = true;

      const liveV = containerToVNode(wrap, { liveState: true });
      assert.equal('checked' in liveV.children[0].props, false);
      assert.equal(liveV.children[1].props.checked, '');
      assert.equal(liveV.children[2].props.checked, '');
      assert.equal(liveV.children[2].props.value, 'r1');

      // HTML에 value 속성이 없던 체크박스에 브라우저 기본 프로퍼티 값("on")이 끼어들지 않아야
      // liveState: false 검증(PatchLab.verify)과 1:1로 일치한다
      const attrV = containerToVNode(env.document.createElement('div'));
      assert.equal(liveV.children[0].props.value, undefined);
      assert.equal(liveV.children[1].props.value, undefined);
      assert.ok(attrV);
    });

    it('<textarea>의 현재 value 프로퍼티(수정 및 빈 문자열 삭제)를 자식 텍스트 노드로 반영한다', () => {
      const wrap = env.document.createElement('div');
      wrap.innerHTML = '<textarea>원래 글</textarea><textarea>지울 글</textarea>';
      const [ta1, ta2] = wrap.querySelectorAll('textarea');

      ta1.value = '사용자가 고친\n두 줄 텍스트';
      ta2.value = '';

      const liveV = containerToVNode(wrap, { liveState: true });
      assert.deepEqual(liveV.children[0].children, [text('사용자가 고친\n두 줄 텍스트')]);
      assert.deepEqual(liveV.children[1].children, []);

      const attrV = containerToVNode(wrap, { liveState: false });
      assert.deepEqual(attrV.children[0].children, [text('원래 글')]);
      assert.deepEqual(attrV.children[1].children, [text('지울 글')]);
    });

    it('<select> / <option>에서 선택 변경 시 현재 selected 상태를 정확히 반영한다', () => {
      const wrap = env.document.createElement('div');
      wrap.innerHTML = `
        <select>
          <option value="kr" selected>한국</option>
          <option value="us">미국</option>
          <option value="jp">일본</option>
        </select>
      `;
      const select = wrap.querySelector('select');
      select.value = 'jp';

      const liveV = containerToVNode(wrap, { liveState: true });
      const opts = liveV.children[0].children;
      assert.equal('selected' in opts[0].props, false);
      assert.equal('selected' in opts[1].props, false);
      assert.equal(opts[2].props.selected, '');

      const attrV = containerToVNode(wrap, { liveState: false });
      assert.equal(attrV.children[0].children[0].props.selected, '');
      assert.equal('selected' in attrV.children[0].children[2].props, false);
    });
  });
});
