import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  OP,
  NS_SVG,
  h,
  element,
  text,
  comment,
  fragment,
  createDOM,
  render,
  diff,
  patch,
  domToVNode,
  containerToVNode,
  htmlToVNode,
  isEqual,
} from '../../src/vdom/index.js';
import { setupDOM } from './setup-dom.js';

describe('04. Patch 적용 정확성·노드 재사용·복합 인덱스 이동·폼 프로퍼티 동기화', () => {
  let env;
  let container;

  beforeEach(() => {
    env = setupDOM();
    container = env.document.createElement('div');
    env.document.body.appendChild(container);
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('DOM 노드 동일성(Identity) 재사용 및 제자리 수정', () => {
    it('일부 자식의 텍스트·속성만 바뀔 때 해당 요소 자체와 형제 DOM 노드의 참조가 그대로 유지된다', () => {
      const t1 = fragment([
        h('header', { id: 'hdr' }, '고정 헤더'),
        h('main', { class: 'old-cls' }, h('p', null, '이전 본문'), h('span', null, '유지됨')),
        h('footer', null, '고정 푸터'),
      ]);
      render(t1, container);

      const hdrBefore = container.children[0];
      const mainBefore = container.children[1];
      const pBefore = mainBefore.children[0];
      const spanBefore = mainBefore.children[1];
      const ftrBefore = container.children[2];
      mainBefore.__customState = { keepMe: 42 };

      const t2 = fragment([
        h('header', { id: 'hdr' }, '고정 헤더'),
        h('main', { class: 'new-cls', 'data-active': '1' }, h('p', null, '새 본문'), h('span', null, '유지됨')),
        h('footer', null, '고정 푸터'),
      ]);

      const changedNodes = [];
      patch(container, diff(t1, t2), { onChange: (node, op) => changedNodes.push({ node, op }) });

      assert.equal(container.children[0], hdrBefore);
      assert.equal(container.children[1], mainBefore);
      assert.equal(mainBefore.children[0], pBefore);
      assert.equal(mainBefore.children[1], spanBefore);
      assert.equal(container.children[2], ftrBefore);
      assert.deepEqual(mainBefore.__customState, { keepMe: 42 });
      assert.equal(mainBefore.getAttribute('class'), 'new-cls');
      assert.equal(mainBefore.getAttribute('data-active'), '1');
      assert.equal(pBefore.textContent, '새 본문');
      assert.equal(isEqual(containerToVNode(container), t2), true);
      assert.equal(changedNodes.length, 2);
    });

    it('key 기반 리스트 맨 앞에 항목을 끼워 넣거나 순서를 뒤집어도 기존 DOM 노드를 재생성하지 않고 재사용한다', () => {
      const t1 = fragment([
        h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B'), h('li', { key: 'c' }, 'C')),
      ]);
      render(t1, container);
      const ul = container.firstChild;
      const [liA, liB, liC] = ul.children;

      // 1) 맨 앞에 x 삽입
      const t2 = fragment([
        h(
          'ul',
          null,
          h('li', { key: 'x' }, 'X'),
          h('li', { key: 'a' }, 'A'),
          h('li', { key: 'b' }, 'B'),
          h('li', { key: 'c' }, 'C'),
        ),
      ]);
      const notified = [];
      patch(container, diff(t1, t2), { onChange: (n) => notified.push(n) });

      assert.equal(ul.children.length, 4);
      assert.equal(ul.children[1], liA);
      assert.equal(ul.children[2], liB);
      assert.equal(ul.children[3], liC);
      // 새로 추가된 X만 변경 알림을 받고 기존 A, B, C는 이동조차 일어나지 않아야 한다
      assert.equal(notified.length, 1);
      assert.equal(notified[0], ul.children[0]);

      // 2) 역순 재정렬 + 텍스트 동시 수정
      const t3 = fragment([
        h(
          'ul',
          null,
          h('li', { key: 'c' }, 'C!'),
          h('li', { key: 'b' }, 'B'),
          h('li', { key: 'a' }, 'A'),
          h('li', { key: 'x' }, 'X'),
        ),
      ]);
      patch(container, diff(t2, t3));

      assert.equal(ul.children[0], liC);
      assert.equal(ul.children[1], liB);
      assert.equal(ul.children[2], liA);
      assert.equal(liC.textContent, 'C!');
      assert.equal(isEqual(containerToVNode(container), t3), true);
    });
  });

  describe('삭제·삽입·이동·교체가 뒤섞인 복합 인덱스 변동 시나리오', () => {
    it('한 부모 안에서 앞/중간 삭제 + 앞/중간/끝 삽입 + key 이동 + 속성/텍스트 수정이 동시에 일어나도 인덱스가 밀리지 않는다', () => {
      const t1 = fragment([
        h(
          'div',
          null,
          h('p', { key: 'del1' }, '삭제1'),
          h('p', { key: 'k1', class: 'old' }, '유지이동1'),
          h('p', { key: 'del2' }, '삭제2'),
          h('p', { key: 'k2' }, '고정2'),
          h('p', { key: 'del3' }, '삭제3'),
          h('p', { key: 'k3' }, '앞으로갈3'),
        ),
      ]);
      render(t1, container);
      const div = container.firstChild;
      const nodeK1 = div.children[1];
      const nodeK2 = div.children[3];
      const nodeK3 = div.children[5];

      const t2 = fragment([
        h(
          'div',
          null,
          h('span', { key: 'ins0' }, '맨앞삽입'),
          h('p', { key: 'k3' }, '앞으로온3'),
          h('em', { key: 'insMid' }, '중간삽입'),
          h('p', { key: 'k2' }, '고정2'),
          h('p', { key: 'k1', class: 'new' }, '뒤로간1'),
          h('strong', { key: 'insEnd' }, '맨끝삽입'),
        ),
      ]);

      patch(container, diff(t1, t2));
      assert.equal(isEqual(containerToVNode(container), t2), true);
      assert.equal(div.children[1], nodeK3);
      assert.equal(div.children[3], nodeK2);
      assert.equal(div.children[4], nodeK1);
      assert.equal(nodeK1.getAttribute('class'), 'new');
    });

    it('같은 key를 가진 노드의 태그가 바뀌면서 동시에 위치까지 이동(REPLACE + MOVE)해도 정확히 목표 트리가 된다', () => {
      // [ <div key="a">1</div>, <p key="b">2</p> ]  →  [ <p key="b">2</p>, <span key="a">1</span> ]
      const t1 = fragment([
        h('div', null, h('div', { key: 'a' }, '1'), h('p', { key: 'b' }, '2')),
      ]);
      const t2 = fragment([
        h('div', null, h('p', { key: 'b' }, '2'), h('span', { key: 'a' }, '1')),
      ]);

      render(t1, container);
      const pB = container.firstChild.children[1];

      patch(container, diff(t1, t2));

      const actual = containerToVNode(container);
      assert.equal(isEqual(actual, t2), true, `기대: <p key="b">2</p><span key="a">1</span>, 실제: ${container.innerHTML}`);
      assert.equal(container.firstChild.children.length, 2);
      assert.equal(container.firstChild.children[0], pB);
      assert.equal(container.firstChild.children[1].tagName, 'SPAN');
    });

    it('key가 있는 자식과 key가 없는 자식이 섞여서 위치가 뒤바뀔 때도 목표 트리와 정확히 일치한다', () => {
      const t1 = fragment([
        h(
          'ul',
          null,
          h('li', null, '비키1'),
          h('li', { key: 'a' }, '키A'),
          h('li', null, '비키2'),
          h('li', { key: 'b' }, '키B'),
        ),
      ]);
      const t2 = fragment([
        h(
          'ul',
          null,
          h('li', { key: 'b' }, '키B'),
          h('li', { key: 'a' }, '키A'),
          h('li', null, '비키1-수정'),
          h('li', null, '비키2'),
        ),
      ]);

      render(t1, container);
      patch(container, diff(t1, t2));
      assert.equal(
        isEqual(containerToVNode(container), t2),
        true,
        `혼합 key 패치 실패: 실제 DOM = ${container.innerHTML}`,
      );
    });

    it('중복 key가 있는 리스트에서 바뀌지 않은 중복 key DOM 노드는 불필요하게 삭제·재생성되지 않고 그대로 재사용된다', () => {
      const t1 = fragment([
        h('h3', null, '이전 제목'),
        h('ul', null, h('li', { key: 'dup' }, '항목1'), h('li', { key: 'dup' }, '항목2')),
      ]);
      const t2 = fragment([
        h('h3', null, '새 제목'),
        h('ul', null, h('li', { key: 'dup' }, '항목1'), h('li', { key: 'dup' }, '항목2')),
      ]);

      render(t1, container);
      const [li0Before, li1Before] = container.querySelectorAll('li');

      patch(container, diff(t1, t2));
      const [li0After, li1After] = container.querySelectorAll('li');

      assert.deepEqual(containerToVNode(container), t2);
      assert.equal(li0After, li0Before, '변경 없는 첫 번째 중복 key <li>가 삭제·재생성됨');
      assert.equal(li1After, li1Before, '변경 없는 두 번째 중복 key <li>가 재사용되지 않음');
    });

    it('부모에 붙어 있지 않은(detached) 루트 노드의 REPLACE 및 onChange 콜백 통지가 정확히 동작한다', () => {
      const oldV = h('div', { id: 'detached' }, '이전');
      const newV = h('section', { id: 'replaced' }, '이후');
      const detachedEl = createDOM(oldV);

      const notified = [];
      const nextEl = patch(detachedEl, diff(oldV, newV), {
        onChange: (node, op) => notified.push({ node, op }),
      });

      assert.equal(nextEl.tagName, 'SECTION');
      assert.equal(nextEl.id, 'replaced');
      assert.equal(notified.length, 1);
      assert.equal(notified[0].node, nextEl);
      assert.equal(notified[0].op.type, OP.REPLACE);
    });

    it('루트 요소 자체가 다른 태그로 REPLACE 될 때 부모 안에서 교체되고 새 루트 DOM을 반환한다', () => {
      const oldV = h('div', { id: 'old' }, '안녕');
      const newV = h('article', { id: 'new' }, h('h1', null, '반가워'));

      const oldEl = createDOM(oldV);
      container.appendChild(oldEl);

      const returnedRoot = patch(oldEl, diff(oldV, newV));
      assert.equal(returnedRoot.tagName, 'ARTICLE');
      assert.equal(container.firstChild, returnedRoot);
      assert.equal(isEqual(domToVNode(returnedRoot), newV), true);
    });

    it('주석 노드(COMMENT)의 내용 변경(TEXT) 및 요소와의 교체(REPLACE)가 정상 반영된다', () => {
      const t1 = fragment([comment('초기 주석'), h('span', null, '본문')]);
      const t2 = fragment([comment('수정된 주석'), comment('요소가 주석으로 교체됨')]);

      render(t1, container);
      const firstComment = container.childNodes[0];

      patch(container, diff(t1, t2));
      assert.equal(container.childNodes[0], firstComment);
      assert.equal(firstComment.nodeValue, '수정된 주석');
      assert.equal(container.childNodes[1].nodeType, env.window.Node.COMMENT_NODE);
      assert.equal(isEqual(containerToVNode(container, { keepComments: true }), t2), true);
    });
  });

  describe('SVG 생성 및 Patch 네임스페이스·속성 처리', () => {
    it('SVG 요소 생성 및 자식 추가·속성(class, viewBox, fill) 패치 시 SVG 네임스페이스가 유지되고 에러가 없다', () => {
      const t1 = htmlToVNode(
        '<svg viewBox="0 0 50 50" class="icon"><rect x="0" y="0" width="10" height="10"/></svg>',
      );
      const t2 = htmlToVNode(
        '<svg viewBox="0 0 100 100" class="icon active"><rect x="0" y="0" width="20" height="20"/><circle cx="50" cy="50" r="25" fill="red"/></svg>',
      );

      render(t1, container);
      const svgEl = container.firstChild;
      assert.equal(svgEl.namespaceURI, NS_SVG);

      patch(container, diff(t1, t2));
      assert.equal(svgEl.getAttribute('viewBox'), '0 0 100 100');
      assert.equal(svgEl.getAttribute('class'), 'icon active');

      const circleEl = svgEl.children[1];
      assert.equal(circleEl.localName, 'circle');
      assert.equal(circleEl.namespaceURI, NS_SVG);
      assert.equal(isEqual(containerToVNode(container), t2), true);
    });

    it('h("svg", ...)로 직접 생성한 SVG와 그 하위 요소도 브라우저가 렌더링할 수 있도록 SVG 네임스페이스(NS_SVG)로 생성·패치된다', () => {
      const t1 = fragment([
        h('svg', { viewBox: '0 0 24 24' }, h('circle', { cx: 12, cy: 12, r: 8 })),
      ]);
      const t2 = fragment([
        h(
          'svg',
          { viewBox: '0 0 24 24' },
          h('circle', { cx: 12, cy: 12, r: 8 }),
          h('path', { d: 'M0 0h24v24H0z' }),
        ),
      ]);

      render(t1, container);
      const svgEl = container.firstChild;
      assert.equal(svgEl.namespaceURI, NS_SVG, '<svg> 요소가 HTML 네임스페이스로 생성되면 브라우저에서 렌더링되지 않음');
      assert.equal(svgEl.firstChild.namespaceURI, NS_SVG, '<circle> 자식 요소가 SVG 네임스페이스여야 함');

      patch(container, diff(t1, t2));
      assert.equal(svgEl.children[1].namespaceURI, NS_SVG, 'patch로 추가된 <path>도 SVG 네임스페이스여야 함');
    });
  });

  describe('폼 요소의 attribute ↔ property 동기화 (더티 상태 대응)', () => {
    it('사용자가 입력해 더티 상태가 된 <input>에서 value가 변경되거나 삭제(remove)될 때 화면 프로퍼티(.value)도 함께 갱신된다', () => {
      const t1 = fragment([h('input', { type: 'text', value: '초기값' })]);
      render(t1, container);
      const input = container.firstChild;

      // 1) 사용자가 직접 타이핑하여 더티 상태로 만든 뒤 새 value로 패치
      input.value = '사용자가 친 값';
      const t2 = fragment([h('input', { type: 'text', value: '패치된 값' })]);
      patch(container, diff(t1, t2));
      assert.equal(input.value, '패치된 값');
      assert.equal(input.getAttribute('value'), '패치된 값');

      // 2) value 속성이 제거된 VNode(<input type="text">)로 패치하면 .value도 빈 문자열("")로 초기화되어야 한다
      const t3 = fragment([h('input', { type: 'text' })]);
      patch(container, diff(t2, t3));
      assert.equal(input.hasAttribute('value'), false);
      assert.equal(input.value, '');
      assert.equal(isEqual(containerToVNode(container), t3), true);
    });

    it('더티 상태가 된 <input type="checkbox">에서 checked 속성이 추가·제거될 때 .checked 프로퍼티도 정확히 동기화된다', () => {
      const t1 = fragment([h('input', { type: 'checkbox', checked: true })]);
      render(t1, container);
      const cb = container.firstChild;
      assert.equal(cb.checked, true);

      // checked 제거 패치 -> .checked가 false가 되어야 한다
      const t2 = fragment([h('input', { type: 'checkbox' })]);
      patch(container, diff(t1, t2));
      assert.equal(cb.hasAttribute('checked'), false);
      assert.equal(cb.checked, false);

      // 사용자가 임의로 클릭해 cb.checked = false 인 상태에서 다시 checked 추가 패치
      const t3 = fragment([h('input', { type: 'checkbox', checked: true })]);
      patch(container, diff(t2, t3));
      assert.equal(cb.checked, true);
      assert.equal(cb.hasAttribute('checked'), true);
    });

    it('<textarea>의 내용이 수정(TEXT) → 전체 삭제(REMOVE) → 다시 입력(CREATE)될 때 모든 단계에서 .value가 목표와 일치한다', () => {
      const t1 = fragment([h('textarea', null, '첫 번째 내용')]);
      render(t1, container);
      const ta = container.firstChild;
      assert.equal(ta.value, '첫 번째 내용');

      // 1단계: TEXT 연산으로 변경 (이때 ta.value에 대입되면 브라우저 dirty flag가 켜짐)
      const t2 = fragment([h('textarea', null, '두 번째 내용')]);
      patch(container, diff(t1, t2));
      assert.equal(ta.value, '두 번째 내용');

      // 2단계: 빈 <textarea></textarea>로 비움 (자식 텍스트 노드 REMOVE 연산)
      const t3 = fragment([h('textarea', null)]);
      patch(container, diff(t2, t3));
      assert.equal(ta.value, '', '<textarea> 자식 텍스트가 REMOVE 되었을 때 .value도 빈 문자열이어야 함');

      // 3단계: 비어 있던 <textarea>에 다시 텍스트 추가 (자식 텍스트 노드 CREATE 연산)
      const t4 = fragment([h('textarea', null, '세 번째 내용')]);
      patch(container, diff(t3, t4));
      assert.equal(ta.value, '세 번째 내용', '비어 있던 더티 <textarea>에 텍스트 CREATE 시 .value도 갱신되어야 함');
    });

    it('<select>의 <option selected>가 이동할 때 실제 select.value와 option.selected 프로퍼티가 정확히 바뀐다', () => {
      const t1 = fragment([
        h(
          'select',
          null,
          h('option', { value: 'a', selected: true }, 'A'),
          h('option', { value: 'b' }, 'B'),
          h('option', { value: 'c' }, 'C'),
        ),
      ]);
      const t2 = fragment([
        h(
          'select',
          null,
          h('option', { value: 'a' }, 'A'),
          h('option', { value: 'b' }, 'B'),
          h('option', { value: 'c', selected: true }, 'C'),
        ),
      ]);

      render(t1, container);
      const select = container.firstChild;
      assert.equal(select.value, 'a');

      // 사용자가 수동으로 'b'를 골라 더티 상태로 만든 뒤 t2('c' 선택)로 패치
      select.value = 'b';
      patch(container, diff(t1, t2));

      assert.equal(select.value, 'c');
      assert.equal(select.options[0].selected, false);
      assert.equal(select.options[1].selected, false);
      assert.equal(select.options[2].selected, true);

      // 다시 t1('a' 선택)으로 되돌리기
      patch(container, diff(t2, t1));
      assert.equal(select.value, 'a');
      assert.equal(select.options[0].selected, true);
      assert.equal(select.options[2].selected, false);
    });

    it('<option>에서 value 속성을 제거(remove)했을 때 빈 value="" 속성이 되살아나지 않고 HTML 표준대로 텍스트 값을 따른다', () => {
      // HTML 표준: <option>에 value 속성이 없으면 option.value는 내부 텍스트('사과')를 반환해야 한다.
      const t1 = fragment([
        h('select', null, h('option', { value: 'apple', selected: true }, '사과')),
      ]);
      const t2 = fragment([
        h('select', null, h('option', { selected: true }, '사과')),
      ]);

      render(t1, container);
      patch(container, diff(t1, t2));

      const select = container.firstChild;
      const option = select.options[0];
      assert.equal(option.hasAttribute('value'), false, '<option>에서 제거한 value 속성이 value=""로 되살아남');
      assert.equal(option.value, '사과');
      assert.equal(select.value, '사과');
      assert.equal(isEqual(containerToVNode(container), t2), true);
    });

    it('<input type="checkbox">에서 value 속성을 제거(remove)했을 때 빈 value="" 속성이 되살아나지 않고 HTML 기본값("on")을 유지한다', () => {
      // HTML 표준: checkbox의 value 속성이 없으면 .value는 "on"이며 hasAttribute("value")는 false여야 한다.
      const t1 = fragment([h('input', { type: 'checkbox', value: 'agree', checked: true })]);
      const t2 = fragment([h('input', { type: 'checkbox', checked: true })]);

      render(t1, container);
      patch(container, diff(t1, t2));

      const cb = container.firstChild;
      assert.equal(cb.hasAttribute('value'), false, 'checkbox에서 제거한 value 속성이 value=""로 되살아남');
      assert.equal(cb.value, 'on');
      assert.equal(isEqual(containerToVNode(container), t2), true);
    });
  });
});
