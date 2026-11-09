import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OP,
  NS_SVG,
  h,
  element,
  text,
  comment,
  fragment,
  diff,
  isEqual,
} from '../../src/vdom/index.js';

describe('03. Diff 순수 함수 검증 (5가지 기본 케이스 + Key 재정렬·중복·혼합)', () => {
  describe('기본 계약 및 순수성', () => {
    it('인자가 누락되면 TypeError를 던진다', () => {
      assert.throws(() => diff(null, h('div', null)), TypeError);
      assert.throws(() => diff(h('div', null), undefined), TypeError);
    });

    it('DOM 전역 객체 없이도 동작하는 순수 함수이며 입력 VNode를 절대 변경(mutate)하지 않는다', () => {
      const savedDoc = globalThis.document;
      try {
        globalThis.document = undefined;
        const a = fragment([h('ul', { class: 'list' }, h('li', { key: '1' }, '일'), h('li', { key: '2' }, '이'))]);
        const b = fragment([h('ul', { class: 'list active' }, h('li', { key: '2' }, '이!'), h('li', { key: '3' }, '삼'))]);
        const snapshotA = JSON.stringify(a);
        const snapshotB = JSON.stringify(b);

        const ops = diff(a, b);
        assert.ok(ops.length > 0);
        assert.equal(JSON.stringify(a), snapshotA);
        assert.equal(JSON.stringify(b), snapshotB);
      } finally {
        globalThis.document = savedDoc;
      }
    });

    it('구조와 속성·내용이 완전히 동일한 트리는 빈 배열([])을 반환하고 isEqual이 true이다', () => {
      const make = () =>
        fragment([
          h('div', { id: 'p', 'data-x': '1' }, '텍스트', h('span', { hidden: true }, '내부')),
          comment('메모'),
        ]);
      assert.deepEqual(diff(make(), make()), []);
      assert.equal(isEqual(make(), make()), true);
    });
  });

  describe('과제의 5가지 필수 Diff 케이스', () => {
    it('① CREATE (추가): 빈 부모, 맨 앞, 중간, 맨 뒤에 새 자식 노드를 추가한다', () => {
      const oldTree = h('ul', null, h('li', null, 'A'), h('li', null, 'B'));
      const newTree = h('ul', null, h('li', null, 'A'), h('li', null, 'B'), h('li', null, 'C'));
      const ops = diff(oldTree, newTree);

      assert.equal(ops.length, 1);
      assert.deepEqual(ops[0], {
        type: OP.CREATE,
        parentPath: [],
        index: 2,
        node: h('li', null, 'C'),
      });
    });

    it('② REMOVE (삭제): 자식 삭제 시 이전 트리 기준의 path로 REMOVE를 생성한다', () => {
      const oldTree = h('ul', null, h('li', null, 'A'), h('li', null, 'B'), h('li', null, 'C'));
      const newTree = h('ul', null, h('li', null, 'A'));
      const ops = diff(oldTree, newTree);

      const removePaths = ops.filter((o) => o.type === OP.REMOVE).map((o) => o.path);
      assert.equal(ops.length, 2);
      assert.deepEqual(removePaths.sort((x, y) => x[0] - y[0]), [[1], [2]]);
    });

    it('③ REPLACE (교체): 태그 변경, 노드 종류(요소↔텍스트↔주석) 변경, 네임스페이스 변경 시 하위 비교 없이 통째로 교체한다', () => {
      // 루트 태그 변경
      const rootOps = diff(h('div', { id: 'same' }, h('p', null, '같은 자식')), h('section', { id: 'same' }, h('p', null, '다른 자식')));
      assert.equal(rootOps.length, 1);
      assert.deepEqual(rootOps[0], {
        type: OP.REPLACE,
        path: [],
        node: h('section', { id: 'same' }, h('p', null, '다른 자식')),
      });

      // 요소 ↔ 텍스트 교체
      const typeOps = diff(h('div', null, h('span', null, 'hi')), h('div', null, 'hi'));
      assert.deepEqual(typeOps, [{ type: OP.REPLACE, path: [0], node: text('hi') }]);

      // 같은 태그명이라도 네임스페이스(HTML vs SVG)가 다르면 REPLACE여야 한다
      const htmlSvg = element('svg', {}, []);
      const realSvg = element('svg', {}, [], NS_SVG);
      const nsOps = diff(htmlSvg, realSvg);
      assert.equal(nsOps.length, 1);
      assert.equal(nsOps[0].type, OP.REPLACE);
    });

    it('④ TEXT (텍스트·주석 내용 변경): 텍스트 노드와 주석 노드의 값 변경을 감지한다', () => {
      const oldTree = fragment([h('p', null, '기존 문장'), comment('기존 주석')]);
      const newTree = fragment([h('p', null, '바뀐 문장'), comment('바뀐 주석')]);
      const ops = diff(oldTree, newTree);

      assert.deepEqual(ops, [
        { type: OP.TEXT, path: [0, 0], value: '바뀐 문장' },
        { type: OP.TEXT, path: [1], value: '바뀐 주석' },
      ]);
    });

    it('⑤ PROPS (속성 추가·수정·삭제): 한 요소에서 추가·수정·삭제를 정확히 분리하고 안 바뀐 속성은 건드리지 않는다', () => {
      const oldTree = h('input', { id: 'keep', class: 'old', disabled: true, placeholder: '지워짐' });
      const newTree = h('input', { id: 'keep', class: 'new', title: '추가됨' });
      const ops = diff(oldTree, newTree);

      assert.equal(ops.length, 1);
      assert.equal(ops[0].type, OP.PROPS);
      assert.deepEqual(ops[0].path, []);
      assert.deepEqual(ops[0].set, { class: 'new', title: '추가됨' });
      assert.deepEqual([...ops[0].remove].sort(), ['disabled', 'placeholder']);
    });
  });

  describe('Key 기반 재정렬(MOVE), LIS 최소화, 경계값 Key', () => {
    it('맨 앞에 새 key 항목을 끼워 넣어도 기존 항목들은 상대 순서가 같으므로 MOVE가 0건이다', () => {
      const oldTree = h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B'), h('li', { key: 'c' }, 'C'));
      const newTree = h(
        'ul',
        null,
        h('li', { key: 'new' }, 'NEW'),
        h('li', { key: 'a' }, 'A'),
        h('li', { key: 'b' }, 'B'),
        h('li', { key: 'c' }, 'C'),
      );
      const ops = diff(oldTree, newTree);
      const moves = ops.filter((o) => o.type === OP.MOVE);
      const creates = ops.filter((o) => o.type === OP.CREATE);

      assert.equal(moves.length, 0);
      assert.equal(creates.length, 1);
      assert.equal(creates[0].index, 0);
    });

    it('LIS를 이용해 최소 개수의 노드만 MOVE 시킨다 ([a,b,c,d,e] → [a,d,b,c,e] 는 d 1개만 이동)', () => {
      const oldTree = h(
        'ul',
        null,
        ...['a', 'b', 'c', 'd', 'e'].map((k) => h('li', { key: k }, k)),
      );
      const newTree = h(
        'ul',
        null,
        ...['a', 'd', 'b', 'c', 'e'].map((k) => h('li', { key: k }, k)),
      );
      const ops = diff(oldTree, newTree);
      assert.equal(ops.length, 1);
      assert.deepEqual(ops[0], {
        type: OP.MOVE,
        path: [3],
        parentPath: [],
        index: 1,
      });
    });

    it('falsy처럼 보이는 key=""(빈 문자열)와 key="0"도 유효한 고유 key로 식별해 이동시킨다', () => {
      const oldTree = h('ul', null, h('li', { key: '' }, '빈키'), h('li', { key: '0' }, '영키'));
      const newTree = h('ul', null, h('li', { key: '0' }, '영키'), h('li', { key: '' }, '빈키'));
      const ops = diff(oldTree, newTree);

      assert.ok(ops.some((o) => o.type === OP.MOVE));
      assert.equal(ops.filter((o) => o.type === OP.TEXT || o.type === OP.PROPS || o.type === OP.CREATE || o.type === OP.REMOVE).length, 0);
    });

    it('이동하는 key 노드의 속성·자식 텍스트가 동시에 바뀔 때 모든 path는 "변경 전 트리" 인덱스를 가리킨다', () => {
      const oldTree = h(
        'ul',
        null,
        h('li', { key: 'a', class: 'item' }, 'A'),
        h('li', { key: 'b', class: 'old' }, 'B-old'),
      );
      const newTree = h(
        'ul',
        null,
        h('li', { key: 'b', class: 'new' }, 'B-new'),
        h('li', { key: 'a', class: 'item' }, 'A'),
      );
      const ops = diff(oldTree, newTree);

      const propsOp = ops.find((o) => o.type === OP.PROPS);
      const textOp = ops.find((o) => o.type === OP.TEXT);
      assert.ok(propsOp);
      assert.ok(textOp);
      // b는 이전 트리에서 인덱스 [1]에 있었으므로 [1], [1, 0]이어야 한다
      assert.deepEqual(propsOp.path, [1]);
      assert.deepEqual(textOp.path, [1, 0]);
    });

    it('key가 섞인 경우(key 노드와 비-key 노드의 위치 교환)에도 누락 없이 변경 연산을 생성한다', () => {
      const oldTree = h('ul', null, h('li', null, '비키'), h('li', { key: 'a' }, '키A'));
      const newTree = h('ul', null, h('li', { key: 'a' }, '키A'), h('li', null, '비키'));
      const ops = diff(oldTree, newTree);

      // 두 트리는 순서가 분명히 다르므로 ops가 비어 있으면 절대 안 된다!
      assert.ok(ops.length > 0, 'key 노드와 비-key 노드의 순서가 바뀌었는데 diff 결과가 비어 있음');
    });

    it('중복 key가 포함된 트리 비교에서 하나의 이전 노드가 두 번 이상 중복 매칭되어 MOVE/수정되지 않는다', () => {
      // 사용자가 HTML 편집기에서 <li key="dup">을 복사·붙여넣기한 흔한 상황
      const oldTree = h('ul', null, h('li', { key: 'dup' }, '첫째'), h('li', { key: 'b' }, '둘째'));
      const newTree = h(
        'ul',
        null,
        h('li', { key: 'b' }, '둘째'),
        h('li', { key: 'dup' }, '첫째'),
        h('li', { key: 'dup' }, '복제된셋째'),
      );
      const ops = diff(oldTree, newTree);

      // 새 트리는 자식이 3개(기존 2개)이므로 최소 1개의 CREATE가 반드시 있어야 한다
      const creates = ops.filter((o) => o.type === OP.CREATE);
      assert.equal(creates.length, 1, `중복 key 추가 시 새 노드 CREATE가 1건이어야 하나 ${creates.length}건 발생`);
    });

    it('중복 key가 포함된 동일한 두 트리를 비교할 때 diff(t, t)는 빈 배열([])이고 isEqual(t, t)는 true여야 한다 (반사성)', () => {
      const tree = h(
        'ul',
        null,
        h('li', { key: 'dup' }, '첫째'),
        h('li', { key: 'dup' }, '둘째'),
        h('li', { key: 'unique' }, '셋째'),
      );
      const clone = h(
        'ul',
        null,
        h('li', { key: 'dup' }, '첫째'),
        h('li', { key: 'dup' }, '둘째'),
        h('li', { key: 'unique' }, '셋째'),
      );

      assert.deepEqual(diff(tree, clone), []);
      assert.equal(isEqual(tree, clone), true);
    });
  });
});
