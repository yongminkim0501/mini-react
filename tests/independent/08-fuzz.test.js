import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  h,
  text,
  comment,
  fragment,
  render,
  diff,
  patch,
  containerToVNode,
  vnodeToHTML,
  isEqual,
} from '../../src/vdom/index.js';
import { setupDOM } from './setup-dom.js';

/** 재현 가능한 시드 고정 의사난수 생성기 (Mulberry32) */
function createRNG(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s += 0x6d2b79f5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    },
    bool(prob = 0.5) {
      return this.next() < prob;
    },
    shuffle(arr) {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

/**
 * 두 DOM 노드가 구조·태그·네임스페이스·속성 집합(순서 무관)·텍스트/주석 값·자식 순서·폼 프로퍼티까지
 * 완전히 동일한지 재귀적으로 검증한다.
 */
function assertDOMEquivalent(actual, expected, context = '') {
  assert.equal(actual.nodeType, expected.nodeType, `${context}: nodeType 불일치`);
  if (actual.nodeType === 3 || actual.nodeType === 8) {
    assert.equal(actual.nodeValue, expected.nodeValue, `${context}: nodeValue 불일치`);
    return;
  }
  if (actual.nodeType === 1) {
    assert.equal(actual.localName, expected.localName, `${context}: tag(localName) 불일치`);
    assert.equal(actual.namespaceURI, expected.namespaceURI, `${context}: namespaceURI 불일치`);

    const actualAttrs = Object.fromEntries(
      Array.from(actual.attributes, (a) => [a.name, a.value]),
    );
    const expectedAttrs = Object.fromEntries(
      Array.from(expected.attributes, (a) => [a.name, a.value]),
    );
    assert.deepEqual(actualAttrs, expectedAttrs, `${context}: attributes 불일치`);

    if (actual.localName === 'input') {
      assert.equal(actual.value, expected.value, `${context}: input.value 불일치`);
      assert.equal(actual.checked, expected.checked, `${context}: input.checked 불일치`);
    } else if (actual.localName === 'textarea') {
      assert.equal(actual.value, expected.value, `${context}: textarea.value 불일치`);
    } else if (actual.localName === 'option') {
      assert.equal(actual.selected, expected.selected, `${context}: option.selected 불일치`);
    }
  }

  assert.equal(
    actual.childNodes.length,
    expected.childNodes.length,
    `${context}: childNodes 개수 불일치 (actual=${actual.innerHTML}, expected=${expected.innerHTML})`,
  );
  for (let i = 0; i < actual.childNodes.length; i++) {
    assertDOMEquivalent(actual.childNodes[i], expected.childNodes[i], `${context}[${i}]`);
  }
}

const TAGS = ['div', 'section', 'p', 'span', 'article', 'strong', 'em'];
const WORDS = ['alpha', 'beta', '정글', '리액트', '0', '  공백포함  ', 'a&b<c>'];

function randomProps(rng, keyValue = null) {
  const props = {};
  if (keyValue !== null) props.key = keyValue;
  if (rng.bool(0.4)) props.class = rng.pick(['c1', 'c2', 'c1 c2', 'active']);
  if (rng.bool(0.3)) props['data-n'] = String(rng.int(0, 20));
  if (rng.bool(0.2)) props.title = rng.pick(['t1', 't2', '힌트']);
  if (rng.bool(0.2)) props.hidden = true;
  return props;
}

function genUnkeyedNode(rng, depth = 0) {
  const r = rng.next();
  if (depth >= 3 || r < 0.3) {
    return rng.bool(0.8) ? text(rng.pick(WORDS)) : comment(`c-${rng.int(1, 9)}`);
  }
  const tag = rng.pick(TAGS);
  const childCount = rng.int(0, 4);
  const children = [];
  for (let i = 0; i < childCount; i++) {
    children.push(genUnkeyedNode(rng, depth + 1));
  }
  return h(tag, randomProps(rng), ...children);
}

function genUnkeyedTree(rng) {
  const count = rng.int(0, 4);
  const children = [];
  for (let i = 0; i < count; i++) children.push(genUnkeyedNode(rng, 0));
  return fragment(children);
}

function genUniqueKeyedList(rng, depth = 0) {
  const pool = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', '', '0'];
  const chosen = rng.shuffle(pool).slice(0, rng.int(0, 6));
  return chosen.map((k) => {
    const tag = rng.bool(0.7) ? 'div' : 'span';
    const inner =
      depth < 1 && rng.bool(0.35)
        ? genUniqueKeyedList(rng, depth + 1)
        : [text(`${k}:${rng.pick(WORDS)}`)];
    return h(tag, randomProps(rng, k), ...inner);
  });
}

function genAdversarialMixedTree(rng) {
  const keyPool = ['a', 'b', 'c', 'dup', 'dup', '', '0', null, null, null];
  const count = rng.int(0, 6);
  const items = [];
  for (let i = 0; i < count; i++) {
    const k = rng.pick(keyPool);
    if (k === null && rng.bool(0.25)) {
      items.push(text(rng.pick(WORDS)));
    } else {
      const tag = rng.pick(['div', 'span', 'p']);
      items.push(h(tag, randomProps(rng, k), rng.pick(WORDS)));
    }
  }
  return fragment([h('div', { id: 'arena' }, ...items)]);
}

function genFormTree(rng) {
  const items = [];
  const count = rng.int(1, 4);
  for (let i = 0; i < count; i++) {
    const kind = rng.int(0, 3);
    const key = rng.bool(0.5) ? `f${i}` : null;
    if (kind === 0) {
      const props = { type: 'text' };
      if (key !== null) props.key = key;
      if (rng.bool(0.7)) props.value = rng.pick(['', 'abc', '정글', '0']);
      items.push(h('input', props));
    } else if (kind === 1) {
      const props = { type: 'checkbox' };
      if (key !== null) props.key = key;
      if (rng.bool(0.5)) props.checked = true;
      items.push(h('input', props));
    } else if (kind === 2) {
      const props = key !== null ? { key } : null;
      const content = rng.bool(0.6) ? [rng.pick(['메모A', '두줄\n메모', '   '])] : [];
      items.push(h('textarea', props, ...content));
    } else {
      const selIdx = rng.int(0, 2);
      const props = key !== null ? { key } : null;
      items.push(
        h(
          'select',
          props,
          ...['opt0', 'opt1', 'opt2'].map((v, idx) =>
            h('option', { value: v, selected: idx === selIdx }, v),
          ),
        ),
      );
    }
  }
  return fragment([h('form', null, ...items)]);
}

describe('08. 속성 기반 퍼즈 테스트 (고정 시드: 임의 트리 쌍에 대해 diff → patch === render(목표))', () => {
  let env;

  beforeEach(() => {
    env = setupDOM();
  });

  afterEach(() => {
    env.cleanup();
  });

  it('[Seed 0x11070001] key 없는 무작위 트리 500쌍 연속 체인에서 diff → patch 결과가 항상 목표 트리와 일치한다', () => {
    const rng = createRNG(0x11070001);
    const liveContainer = env.document.createElement('div');
    const expectedContainer = env.document.createElement('div');

    let current = genUnkeyedTree(rng);
    render(current, liveContainer);

    for (let step = 0; step < 500; step++) {
      const next = genUnkeyedTree(rng);
      patch(liveContainer, diff(current, next));
      render(next, expectedContainer);

      assertDOMEquivalent(liveContainer, expectedContainer, `Unkeyed step=${step}`);
      const parsed = containerToVNode(liveContainer, { keepComments: true, ignoreWhitespace: false });
      assert.equal(isEqual(parsed, next), true, `Unkeyed VNode 불일치 (step=${step})`);
      current = next;
    }
  });

  it('[Seed 0x11070002] 고유 key(태그 유지) 무작위 리스트 500쌍에서 diff → patch 결과 일치 및 DOM 노드 재사용을 보장한다', () => {
    const rng = createRNG(0x11070002);
    const liveContainer = env.document.createElement('div');
    const expectedContainer = env.document.createElement('div');

    const genSameTagKeyed = () => {
      const pool = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', '', '0'];
      const chosen = rng.shuffle(pool).slice(0, rng.int(0, 6));
      return fragment([
        h(
          'ul',
          null,
          ...chosen.map((k) => h('li', randomProps(rng, k), `${k}:${rng.pick(WORDS)}`)),
        ),
      ]);
    };

    let current = genSameTagKeyed();
    render(current, liveContainer);

    for (let step = 0; step < 500; step++) {
      const ulBefore = liveContainer.firstChild;
      const domByKeyBefore = new Map();
      for (const child of ulBefore.children) {
        domByKeyBefore.set(child.getAttribute('key'), child);
      }

      const next = genSameTagKeyed();
      patch(liveContainer, diff(current, next));
      render(next, expectedContainer);

      assertDOMEquivalent(liveContainer, expectedContainer, `Keyed(태그 유지) step=${step}`);

      for (const child of liveContainer.firstChild.children) {
        const k = child.getAttribute('key');
        if (domByKeyBefore.has(k)) {
          assert.equal(child, domByKeyBefore.get(k), `Key="${k}" DOM 노드가 재사용되지 않음 (step=${step})`);
        }
      }
      current = next;
    }
  });

  it('[Seed 0x11070003] 고유 key 리스트에서 태그 교체(div↔span)와 재정렬이 동시에 일어나는 무작위 500쌍 검증', () => {
    const rng = createRNG(0x11070003);
    const liveContainer = env.document.createElement('div');
    const expectedContainer = env.document.createElement('div');

    let current = fragment([h('div', null, ...genUniqueKeyedList(rng, 0))]);
    render(current, liveContainer);

    for (let step = 0; step < 500; step++) {
      const next = fragment([h('div', null, ...genUniqueKeyedList(rng, 0))]);
      patch(liveContainer, diff(current, next));
      render(next, expectedContainer);

      assertDOMEquivalent(
        liveContainer,
        expectedContainer,
        `Keyed(태그 교체 포함) step=${step}\n이전:${vnodeToHTML(current)}\n목표:${vnodeToHTML(next)}`,
      );
      current = next;
    }
  });

  it('[Seed 0x11070004] key 혼합(key + 비-key + 텍스트) 및 중복 key가 섞인 적대적 무작위 트리 300쌍 검증', () => {
    const rng = createRNG(0x11070004);
    const liveContainer = env.document.createElement('div');
    const expectedContainer = env.document.createElement('div');

    let current = genAdversarialMixedTree(rng);
    render(current, liveContainer);

    for (let step = 0; step < 300; step++) {
      const next = genAdversarialMixedTree(rng);
      patch(liveContainer, diff(current, next));
      render(next, expectedContainer);

      assertDOMEquivalent(
        liveContainer,
        expectedContainer,
        `혼합/중복 key 적대적 fuzz step=${step}\n이전:${vnodeToHTML(current)}\n목표:${vnodeToHTML(next)}`,
      );
      current = next;
    }
  });

  it('[Seed 0x11070005] 폼 요소(input, checkbox, textarea, select) 무작위 상태 전이 300쌍에서 attribute 및 live 프로퍼티 일치 검증', () => {
    const rng = createRNG(0x11070005);
    const liveContainer = env.document.createElement('div');
    const expectedContainer = env.document.createElement('div');

    let current = genFormTree(rng);
    render(current, liveContainer);

    for (let step = 0; step < 300; step++) {
      const next = genFormTree(rng);
      patch(liveContainer, diff(current, next));
      render(next, expectedContainer);

      assertDOMEquivalent(
        liveContainer,
        expectedContainer,
        `폼 요소 상태 전이 fuzz step=${step}\n이전:${vnodeToHTML(current)}\n목표:${vnodeToHTML(next)}`,
      );
      current = next;
    }
  });
});
