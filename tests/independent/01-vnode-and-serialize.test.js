import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT,
  COMMENT,
  ELEMENT,
  FRAGMENT,
  NS_SVG,
  h,
  element,
  text,
  comment,
  fragment,
  normalizeChildren,
  isElement,
  isText,
  keyOf,
  vnodeToHTML,
  htmlToVNode,
  isEqual,
} from '../../src/vdom/index.js';
import { setupDOM } from './setup-dom.js';

describe('01. VNode 생성·정규화 및 HTML 직렬화(vnodeToHTML)', () => {
  let env;

  beforeEach(() => {
    env = setupDOM();
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('VNode 정규화 규칙', () => {
    it('빈 문자열 텍스트 노드를 제거하고 null/undefined/boolean 자식을 무시한다', () => {
      const v = h('div', null, '', null, undefined, false, true, text(''));
      assert.equal(v.type, ELEMENT);
      assert.equal(v.tag, 'div');
      assert.deepEqual(v.children, []);
    });

    it('숫자 0과 음수, 소수를 무시하지 않고 문자열 텍스트 노드로 변환한다', () => {
      const v = h('span', null, 0);
      assert.deepEqual(v.children, [{ type: TEXT, value: '0' }]);

      const v2 = h('span', null, -42, ':', 3.14);
      assert.deepEqual(v2.children, [{ type: TEXT, value: '-42:3.14' }]);
    });

    it('인접한 텍스트 노드(문자열, 숫자, text(), 중첩 배열, 중첩 fragment 사이)를 하나로 병합한다', () => {
      const v = h(
        'p',
        null,
        'Hello',
        null,
        false,
        [' ', text('World')],
        fragment([]),
        fragment(['!', [0, text('?')]]),
      );
      assert.deepEqual(v.children, [{ type: TEXT, value: 'Hello World!0?' }]);
    });

    it('요소나 주석이 사이에 있으면 인접하지 않은 텍스트는 병합하지 않는다', () => {
      const v = h('div', null, 'A', h('br', null), 'B', comment('sep'), 'C');
      assert.equal(v.children.length, 5);
      assert.deepEqual(v.children[0], { type: TEXT, value: 'A' });
      assert.equal(v.children[1].tag, 'br');
      assert.deepEqual(v.children[2], { type: TEXT, value: 'B' });
      assert.deepEqual(v.children[3], { type: COMMENT, value: 'sep' });
      assert.deepEqual(v.children[4], { type: TEXT, value: 'C' });
    });

    it('h()의 props 정규화: true는 빈 문자열(""), false/null/undefined는 제외, 숫자는 문자열로 변환한다', () => {
      const v = h('input', {
        type: 'checkbox',
        checked: true,
        disabled: false,
        placeholder: null,
        title: undefined,
        tabindex: 0,
        maxlength: 10,
      });
      assert.deepEqual(v.props, {
        type: 'checkbox',
        checked: '',
        tabindex: '0',
        maxlength: '10',
      });
    });

    it('공개 생성 함수 element() 직접 호출 시에도 정규화 규칙 3(props 값은 항상 문자열, 불리언은 "")을 지키는지 확인', () => {
      // 명세(vnode.js 상단 주석):
      // "정규화 규칙 (모든 생성 경로가 지킨다 → DOM 과 VNode 가 1:1 로 대응한다)
      //  3) props 의 값은 항상 문자열이다. (불리언 속성은 '' )"
      const v = element('button', { disabled: true, hidden: false, tabindex: 2 }, ['클릭']);
      assert.deepEqual(v.props, {
        disabled: '',
        tabindex: '2',
      });
    });

    it('VNode로 변환할 수 없는 객체나 함수를 자식으로 넣으면 TypeError를 던진다', () => {
      assert.throws(() => normalizeChildren([{}]), TypeError);
      assert.throws(() => h('div', null, () => {}), TypeError);
      assert.throws(() => h('div', null, Symbol('x')), TypeError);
    });

    it('isElement, isText, keyOf 헬퍼가 경계값("", 0, undefined)에서 정확히 동작한다', () => {
      const elNoKey = h('li', null, 'a');
      const elEmptyKey = h('li', { key: '' }, 'b');
      const elZeroKey = h('li', { key: 0 }, 'c');
      const txt = text('hello');

      assert.equal(isElement(elNoKey), true);
      assert.equal(isElement(txt), false);
      assert.equal(isText(txt), true);
      assert.equal(isText(null), false);

      assert.equal(keyOf(elNoKey), null);
      assert.equal(keyOf(elEmptyKey), '');
      assert.equal(keyOf(elZeroKey), '0');
      assert.equal(keyOf(txt), null);
      assert.equal(keyOf(null), null);
    });
  });

  describe('vnodeToHTML 직렬화 및 왕복(Round-trip) 일관성', () => {
    it('void 태그(br, img, input, hr 등)는 닫는 태그 없이 직렬화되며 재파싱 시 개수가 늘어나지 않는다', () => {
      const v = fragment([
        h('img', { src: 'logo.png', alt: '로고' }),
        h('br', null),
        h('input', { type: 'text', value: 'abc', disabled: true }),
        h('hr', null),
      ]);
      const html = vnodeToHTML(v);
      assert.ok(!html.includes('</img>'));
      assert.ok(!html.includes('</br>'));
      assert.ok(!html.includes('</input>'));
      assert.ok(!html.includes('</hr>'));

      const parsed = htmlToVNode(html);
      assert.equal(isEqual(v, parsed), true);
    });

    it('텍스트와 속성 안의 특수문자(&, <, >, ")를 이스케이프하여 왕복 변환 시 원본 값을 보존한다', () => {
      const v = fragment([
        h(
          'div',
          { 'data-expr': '1 < 2 && 3 > 1 & "quoted"' },
          '<b>태그가 아니라 텍스트</b> & 앰퍼샌드',
        ),
      ]);
      const html = vnodeToHTML(v, { pretty: true });
      const parsed = htmlToVNode(html);
      assert.equal(isEqual(v, parsed), true);
      assert.equal(parsed.children[0].children[0].value, '<b>태그가 아니라 텍스트</b> & 앰퍼샌드');
      assert.equal(parsed.children[0].props['data-expr'], '1 < 2 && 3 > 1 & "quoted"');
    });

    it('pretty 모드에서 텍스트와 인라인 요소가 섞인 부모는 공백 오염 방지를 위해 줄바꿈하지 않고 왕복 일치한다', () => {
      const v = fragment([
        h(
          'div',
          { class: 'card' },
          h('h2', null, '제목'),
          h('p', null, '앞문장 ', h('b', null, '강조'), ' 뒷문장'),
          h('ul', null, h('li', { key: '1' }, '항목1'), h('li', { key: '2' }, '항목2')),
        ),
      ]);
      const prettyHtml = vnodeToHTML(v, { pretty: true });
      const parsed = htmlToVNode(prettyHtml);
      assert.equal(isEqual(v, parsed), true);
    });

    it('<pre> 내부의 들여쓰기·공백·중첩 요소는 pretty 모드에서도 변형되지 않고 보존된다', () => {
      const v = fragment([
        h('pre', null, '  line 1\n    ', h('span', { class: 'kw' }, 'const'), ' x = 1;\n'),
      ]);
      const prettyHtml = vnodeToHTML(v, { pretty: true });
      const parsed = htmlToVNode(prettyHtml);
      assert.equal(isEqual(v, parsed), true);
    });

    it('SVG 트리를 직렬화한 뒤 다시 htmlToVNode로 파싱해도 네임스페이스와 대소문자 속성이 유지된다', () => {
      const svgTree = htmlToVNode(
        '<svg viewBox="0 0 24 24"><g fill="none"><path d="M0 0h24v24H0z"/></g></svg>',
      );
      const html = vnodeToHTML(svgTree, { pretty: true });
      const roundTripped = htmlToVNode(html);
      assert.equal(roundTripped.children[0].ns, NS_SVG);
      assert.equal(roundTripped.children[0].props.viewBox, '0 0 24 24');
      assert.equal(isEqual(svgTree, roundTripped), true);
    });

    it('<style> 내부의 CSS 선택자(>)와 따옴표(")가 이스케이프 오염 없이 왕복 보존된다', () => {
      const css = '.card > p::before { content: "A & B"; }';
      const v = fragment([h('style', null, css)]);
      const parsed = htmlToVNode(vnodeToHTML(v));
      assert.equal(parsed.children[0].children[0].value, css);
      assert.equal(isEqual(v, parsed), true);
    });

    it('<pre>와 <textarea>가 개행문자(\\n)로 시작할 때도 직렬화 후 재파싱(왕복) 시 첫 줄바꿈이 유실되지 않는다', () => {
      // HTML5 파서는 <pre>, <textarea> 여는 태그 직후의 첫 \n 1개를 흡수(제거)하므로
      // serialize.js 명세("출력한 HTML 을 다시 파싱해도 같은 VNode 가 나온다")를 만족하려면 첫 개행이 보존되어야 한다.
      const v = fragment([
        h('pre', null, '\nconst x = 1;\nconst y = 2;'),
        h('textarea', null, '\n첫 줄 메모'),
      ]);
      const html = vnodeToHTML(v);
      const parsed = htmlToVNode(html);
      assert.deepEqual(parsed, v);
    });

    it('주석 내용에 "-->"가 포함되어 있어도 직렬화 후 재파싱 시 주석이 조기 종료되어 본문으로 유출되지 않는다', () => {
      const v = fragment([comment('주의: a --> b 화살표'), h('p', null, '본문')]);
      const html = vnodeToHTML(v);
      const parsedWithoutComments = htmlToVNode(html, { keepComments: false });
      assert.deepEqual(parsedWithoutComments, fragment([h('p', null, '본문')]));
    });
  });
});
