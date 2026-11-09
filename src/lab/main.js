import { PatchLab } from './lab.js';
import { describeOp, opLabel } from './describe.js';
import { observeChanges } from './watcher.js';
import { alignLines, outlineLines } from './compare.js';
import { diff } from '../vdom/diff.js';

const $ = (selector) => document.querySelector(selector);

const els = {
  real: $('#real-root'),
  test: $('#test-root'),
  source: $('#source'),
  back: $('#btn-back'),
  forward: $('#btn-forward'),
  patch: $('#btn-patch'),
  pos: $('#history-pos'),
  status: $('#status'),
  diffList: $('#diff-list'),
  diffSummary: $('#diff-summary'),
  historyList: $('#history-list'),
  json: $('#vdom-json'),
  pending: $('#pending'),
  compareGrid: $('#compare-grid'),
  compareSummary: $('#compare-summary'),
  compareLabel: $('#compare-label'),
};

/* ───────────── Patch 로 실제로 바뀐 DOM 노드를 잠깐 깜빡여서 "일부만 바뀜" 을 눈으로 확인 ─────────────
 * 주의: class 같은 속성을 붙였다 떼면 실제 DOM 이 Virtual DOM 과 달라진다 (다음 diff/검증이 오염됨).
 * 그래서 DOM 을 건드리지 않는 Web Animations API 로 효과를 준다. */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function flash(node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el || el === els.real || reduceMotion.matches || !el.animate) return;
  el.animate(
    [
      { backgroundColor: 'rgba(250, 204, 21, 0.55)', outline: '2px solid #eab308', outlineOffset: '1px' },
      { backgroundColor: 'rgba(250, 204, 21, 0.55)', outline: '2px solid #eab308', outlineOffset: '1px', offset: 0.25 },
      { backgroundColor: 'rgba(250, 204, 21, 0)', outline: '2px solid transparent', outlineOffset: '1px' },
    ],
    { duration: 1200, easing: 'ease-out' },
  );
}

const lab = new PatchLab({ realRoot: els.real, testRoot: els.test, onChange: flash });
lab.init();
els.source.value = lab.getSource();

/* ───────────── 화면 갱신 ───────────── */
function setStatus(message, kind = 'info') {
  els.status.textContent = message;
  els.status.dataset.kind = kind;
}

function renderDiff(ops, before, title) {
  els.diffList.replaceChildren();
  els.diffSummary.textContent = title;
  if (ops.length === 0) {
    els.diffList.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: '변경 사항이 없습니다.' }));
    return;
  }
  for (const op of ops) {
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = `badge badge-${op.type.toLowerCase()}`;
    badge.textContent = opLabel(op);
    const desc = document.createElement('span');
    desc.textContent = describeOp(op, before);
    li.append(badge, desc);
    els.diffList.append(li);
  }
}

/* ───────────── VDOM 비교: 이전 VDOM 과 새 VDOM 을 나란히 놓고 다른 줄을 표시 ───────────── */
const MARKS = { del: '−', add: '+', same: ' ' };

function cell(text, state, mark) {
  const div = document.createElement('div');
  div.className = `cmp-cell is-${state}`;
  div.dataset.mark = mark;
  if (text !== null) {
    div.textContent = text;
    div.title = text; // 잘린 줄은 마우스를 올려 전체를 볼 수 있다
  }
  return div;
}

function renderCompare({ before, after, label }) {
  const rows = alignLines(outlineLines(before), outlineLines(after));
  const differing = rows.filter((row) => row.kind !== 'same').length;

  els.compareGrid.replaceChildren();
  for (const title of ['이전 VDOM (실제 영역이 보여주는 상태)', '새 VDOM (테스트 영역을 읽은 것)']) {
    const head = document.createElement('div');
    head.className = 'cmp-head';
    head.textContent = title;
    els.compareGrid.append(head);
  }
  for (const { left, right, kind } of rows) {
    const leftState = kind === 'removed' || kind === 'changed' ? 'del' : kind === 'added' ? 'empty' : 'same';
    const rightState = kind === 'added' || kind === 'changed' ? 'add' : kind === 'removed' ? 'empty' : 'same';
    els.compareGrid.append(
      cell(left, leftState, MARKS[leftState] ?? ' '),
      cell(right, rightState, MARKS[rightState] ?? ' '),
    );
  }

  els.compareSummary.textContent = differing ? `${differing}줄 다름` : '차이 없음';
  els.compareLabel.textContent = label;
}

/** 마지막으로 Patch(또는 이동)한 결과. 편집 중이 아닐 때 이걸 보여준다. */
let lastCompare = null;

function renderHistory() {
  const { index, length, canBack, canForward } = lab.state;
  els.back.disabled = !canBack;
  els.forward.disabled = !canForward;
  els.pos.textContent = `${index + 1} / ${length}`;

  els.historyList.replaceChildren();
  lab.history.entries.forEach((entry, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    if (i === index) button.setAttribute('aria-current', 'step');
    button.textContent = `${i}  ${entry.label}`;
    if (entry.opCount) {
      const count = document.createElement('small');
      count.textContent = `${entry.opCount}개 변경`;
      button.append(count);
    }
    button.addEventListener('click', () => navigate(() => lab.goTo(i), `#${i} 로 이동`));
    li.append(button);
    els.historyList.append(li);
  });
  els.historyList.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });

  els.json.textContent = JSON.stringify(lab.current, null, 2);
  updatePending(); // Patch/이동 직후에는 테스트 영역 DOM 이 안 바뀌므로 observer 가 울리지 않는다
}

function reportOutcome(prefix, { ops, verified, recovered }) {
  if (recovered) {
    setStatus(`${prefix}: patch 결과가 기대와 달라 전체 렌더링으로 복구했습니다. (diff/patch 버그 신호)`, 'error');
  } else {
    setStatus(`${prefix}: ${ops.length}개 변경을 적용했습니다. ${verified ? '✓ 실제 영역이 Virtual DOM 과 일치합니다.' : ''}`, 'ok');
  }
}

/* ───────────── 동작 ───────────── */
function doPatch() {
  const result = lab.patch();
  if (!result.changed) {
    setStatus('변경 사항이 없어 History 에 저장하지 않았습니다.', 'info');
    renderDiff([], result.before, '0개');
    return;
  }
  renderDiff(result.ops, result.before, `${result.ops.length}개`);
  reportOutcome('Patch', result);
  lastCompare = { before: result.before, after: lab.current, label: `마지막 Patch 결과 (Patch #${lab.state.index})` };
  renderHistory();
}

function navigate(action, label) {
  const result = action();
  if (!result) return;
  renderDiff(result.ops, result.before, `${result.ops.length}개 (${label})`);
  reportOutcome(label, result);
  els.source.value = lab.getSource();
  lastCompare = { before: result.before, after: result.target, label: `마지막 이동 결과 (${label})` };
  renderHistory();
}

els.patch.addEventListener('click', doPatch);
els.back.addEventListener('click', () => navigate(() => lab.back(), '뒤로가기'));
els.forward.addEventListener('click', () => navigate(() => lab.forward(), '앞으로가기'));

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    doPatch();
  }
});

/* 테스트 영역 ↔ HTML 코드 편집창 동기화 + 변경 감지
 * input 이벤트가 아니라 MutationObserver 를 쓰므로, 타이핑뿐 아니라 스크립트(예시 수정 버튼)나
 * 붙여넣기·실행 취소로 DOM 이 바뀌는 경우도 같은 경로로 잡힌다. */
let syncTimer = 0;
const syncSource = () => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (document.activeElement !== els.source) els.source.value = lab.getSource();
  }, 120);
};

function updatePending() {
  const before = lab.current;
  const after = lab.readTest();
  const count = diff(before, after).length; // "바뀌었다" 의 판정은 diff 가 한다 (원상복구하면 0)
  els.pending.textContent = count ? `변경 ${count}건 감지됨` : '변경 없음';
  els.pending.dataset.dirty = String(count > 0);
  els.patch.dataset.dirty = String(count > 0);

  // 편집 중이면 "Patch 하면 이렇게 된다" 미리보기, 아니면 마지막 Patch 결과를 보여준다
  renderCompare(
    count > 0
      ? { before, after, label: '미리보기: 아직 Patch 전입니다' }
      : lastCompare ?? { before, after, label: '테스트 영역을 고치면 여기에 차이가 표시됩니다' },
  );
}

observeChanges(els.test, () => {
  updatePending();
  syncSource();
});

// MutationObserver 는 "DOM 구조" 의 변화만 본다. 입력창의 글자나 체크박스의 체크는
// property 변경이라 DOM 변화로 잡히지 않으므로 이벤트로 따로 감지한다.
for (const type of ['input', 'change']) {
  els.test.addEventListener(type, () => {
    updatePending();
    syncSource();
  });
}

els.source.addEventListener('input', () => {
  lab.setSource(els.source.value);
});

/* 예시 수정 버튼: 테스트 영역 DOM 을 직접 조작해서 변경을 만든다 */
const scenarios = {
  text() {
    const h2 = els.test.querySelector('h2');
    if (h2) h2.textContent = h2.textContent.endsWith('✨') ? '미니 리액트 연구소' : '미니 리액트 연구소 ✨';
  },
  props() {
    els.test.querySelector('.card')?.classList.toggle('accent');
    els.test.querySelector('a')?.setAttribute('title', '새 탭에서 열립니다');
  },
  add() {
    const ul = els.test.querySelector('ul.todo');
    if (!ul) return '할 일 목록이 없어서 항목을 추가할 수 없습니다.';
    // 삭제 후 다시 추가해도 key 가 겹치지 않도록, 쓰이지 않은 번호를 찾는다
    const used = new Set([...ul.children].map((li) => li.getAttribute('key')));
    let n = ul.children.length + 1;
    while (used.has(`n${n}`)) n++;
    const li = document.createElement('li');
    li.setAttribute('key', `n${n}`);
    li.textContent = `새 항목 ${n}`;
    ul.append(li);
  },
  reorder() {
    const ul = els.test.querySelector('ul.todo');
    if (!ul?.lastElementChild) return '순서를 바꿀 항목이 없습니다.';
    ul.prepend(ul.lastElementChild);
  },
  replace() {
    const p = els.test.querySelector('.desc, blockquote');
    if (!p) return;
    const next = document.createElement(p.localName === 'p' ? 'blockquote' : 'p');
    next.className = 'desc';
    next.append(...p.childNodes);
    p.replaceWith(next);
  },
  /** "항목 추가" 의 짝: 할 일 목록의 마지막 항목을 지운다. (목록 밖의 다른 요소는 건드리지 않는다) */
  remove() {
    const last = els.test.querySelector('ul.todo > li:last-child');
    if (!last) return '삭제할 항목이 없습니다.';
    last.remove();
  },
};

// 시나리오 함수는 "할 수 없는 상황"이면 이유를 문자열로 돌려준다.
document.querySelectorAll('[data-scenario]').forEach((button) => {
  button.addEventListener('click', () => {
    const problem = scenarios[button.dataset.scenario]?.();
    els.source.value = lab.getSource();
    if (problem) setStatus(problem, 'info');
    else setStatus('테스트 영역을 수정했습니다. Patch 를 눌러 실제 영역에 반영하세요.', 'info');
  });
});

renderHistory();
setStatus('실제 영역의 샘플 HTML 을 Virtual DOM 으로 변환해 테스트 영역을 렌더링했습니다.', 'info');
