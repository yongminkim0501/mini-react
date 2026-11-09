/**
 * 두 Virtual DOM 을 나란히 놓고 "어디가 달라졌는지" 보여주기 위한 순수 함수들. (DOM 을 쓰지 않는다)
 *
 *   outlineLines(vnode)  VNode 트리를 한 줄에 노드 하나씩의 윤곽선(들여쓰기 = 깊이)으로 바꾼다.
 *   alignLines(a, b)     두 줄 목록을 비교해 좌/우를 같은 행에 맞춰 놓은 행 목록으로 만든다.
 *
 * 이것은 화면 표시용 "줄 단위" 비교이고, 실제 Patch 에 쓰이는 트리 Diff(src/vdom/diff.js)와는 별개다.
 */

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** VNode → ['<div id="a">', '  <p>', '    "안녕"', ...] */
export function outlineLines(vnode) {
  const lines = [];

  const walk = (node, depth) => {
    const pad = '  '.repeat(depth);
    switch (node.type) {
      case 'text':
        lines.push(`${pad}${JSON.stringify(clip(node.value, 40))}`); // 줄바꿈 등이 눈에 보이도록 이스케이프
        break;
      case 'comment':
        lines.push(`${pad}<!-- ${clip(node.value.trim(), 40)} -->`);
        break;
      case 'fragment':
        node.children.forEach((child) => walk(child, depth)); // 루트는 줄을 만들지 않는다
        break;
      default: {
        // 속성은 이름순으로 출력한다. 트리 Diff 는 속성 순서를 무시하므로(의미가 같다),
        // 순서만 다른 줄이 "다름"으로 표시되지 않게 맞춘다.
        const attrs = Object.entries(node.props)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${clip(value, 30)}"`))
          .join('');
        lines.push(`${pad}<${node.tag}${attrs}>`);
        node.children.forEach((child) => walk(child, depth + 1));
      }
    }
  };

  walk(vnode, 0);
  return lines;
}

/** LCS 표가 너무 커지면(줄 수의 곱) 정밀 비교를 포기하고 가운데 전체를 "다름"으로 본다. */
const MAX_LCS_CELLS = 4_000_000;

/**
 * 두 줄 목록을 행 단위로 맞춘다.
 * @returns {{ left: string|null, right: string|null, kind: 'same'|'changed'|'removed'|'added' }[]}
 *   same    양쪽 동일
 *   changed 왼쪽 줄이 오른쪽 줄로 바뀜 (삭제와 추가가 같은 행에 짝지어짐)
 *   removed 왼쪽에만 있음 (right 는 null)
 *   added   오른쪽에만 있음 (left 는 null)
 */
export function alignLines(a, b) {
  // 앞뒤의 공통 부분은 비교할 필요가 없다
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const rows = [];
  for (let i = 0; i < start; i++) rows.push({ left: a[i], right: b[i], kind: 'same' });

  for (const row of diffSteps(a.slice(start, endA), b.slice(start, endB))) rows.push(row);

  for (let i = 0; i < a.length - endA; i++) {
    rows.push({ left: a[endA + i], right: b[endB + i], kind: 'same' });
  }
  return rows;
}

/** 가운데 구간의 비교 결과를 행 목록으로 만든다. */
function diffSteps(a, b) {
  const steps = lcsSteps(a, b);
  const rows = [];
  let i = 0;
  while (i < steps.length) {
    if (steps[i].t === 'same') {
      rows.push({ left: steps[i].text, right: steps[i].text, kind: 'same' });
      i++;
      continue;
    }
    // 연속된 삭제/추가 묶음은 위에서부터 짝지어 "바뀜" 행으로 만든다
    const removed = [];
    const added = [];
    while (i < steps.length && steps[i].t !== 'same') {
      (steps[i].t === 'del' ? removed : added).push(steps[i].text);
      i++;
    }
    for (let r = 0; r < Math.max(removed.length, added.length); r++) {
      const left = removed[r] ?? null;
      const right = added[r] ?? null;
      rows.push({ left, right, kind: left !== null && right !== null ? 'changed' : left !== null ? 'removed' : 'added' });
    }
  }
  return rows;
}

/** 최장 공통 부분 수열(LCS)로 same / del / add 단계를 만든다. */
function lcsSteps(a, b) {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_LCS_CELLS) {
    return [...a.map((text) => ({ t: 'del', text })), ...b.map((text) => ({ t: 'add', text }))];
  }

  // table[i][j] = a[i..] 와 b[j..] 의 LCS 길이
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const steps = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      steps.push({ t: 'same', text: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      steps.push({ t: 'del', text: a[i++] });
    } else {
      steps.push({ t: 'add', text: b[j++] });
    }
  }
  while (i < n) steps.push({ t: 'del', text: a[i++] });
  while (j < m) steps.push({ t: 'add', text: b[j++] });
  return steps;
}
