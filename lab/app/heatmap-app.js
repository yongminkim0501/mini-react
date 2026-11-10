/**
 * 히트맵 탐색기 앱. 화면은 전부 이 저장소의 미니 React로 그린다.
 * 과제 제약: Hook은 루트 App에서만, 자식은 props만 받는 순수 함수.
 * 엔진을 바꿔 끼울 수 있도록 h·Hook은 engine 객체에서 받는다.
 */
import { startTransition } from '../engine-adapter.js';
import { DATE_COUNT, MAX_SIZE, MIN_SIZE, SIZE_STEP, clampSize, computeStats, generateData, matchCells } from '../data.js';
import { burn } from '../load.js';

export const BASE_TITLE = '히트맵 탐색기 · mini-react lab';

/** 값(0~1) → 배경색. 낮으면 옅은 파랑, 높으면 진한 빨강. */
export function cellColor(value) {
  const hue = Math.round(210 - value * 210);
  const light = Math.round(88 - value * 46);
  return `background:hsl(${hue},70%,${light}%)`;
}

/**
 * @param {ReturnType<import('../engine-adapter.js').createEngine>} engine
 */
export function createHeatmapApp(engine) {
  const { h, useState, useEffect, useMemo } = engine;

  function SearchBar({ query, onQuery }) {
    return h(
      'div',
      { class: 'search' },
      h('label', { for: 'search' }, '태그 검색'),
      h('input', {
        id: 'search',
        type: 'text',
        autocomplete: 'off',
        placeholder: '예: north-alpha',
        value: query,
        onInput: (event) => onQuery(event.target.value),
      }),
      h('span', { class: 'echo-label' }, '입력값'),
      h('output', { id: 'echo', class: 'echo' }, query),
    );
  }

  function Controls({ threshold, size, seed, onThreshold, onSize, onRegenerate }) {
    return h(
      'div',
      { class: 'controls' },
      h(
        'label',
        { class: 'control' },
        h('span', null, `임계값 ${threshold.toFixed(2)}`),
        h('input', {
          id: 'threshold',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.05,
          value: String(threshold),
          onInput: (event) => onThreshold(Number(event.target.value)),
        }),
      ),
      h(
        'label',
        { class: 'control' },
        h('span', null, `셀 수 ${size.toLocaleString()}`),
        h('input', {
          id: 'size',
          type: 'range',
          min: MIN_SIZE,
          max: MAX_SIZE,
          step: SIZE_STEP,
          value: String(size),
          // 끌 때마다 재생성하지 않고 놓을 때만 반영한다.
          onChange: (event) => onSize(Number(event.target.value)),
        }),
      ),
      h('button', { id: 'regen', type: 'button', onClick: onRegenerate }, `데이터 재생성 (seed ${seed})`),
    );
  }

  function Cell({ cell, catId, hit, low, selected, cellCost }) {
    if (cellCost > 0) burn(cellCost);
    let cls = 'cell';
    if (low) cls += ' low';
    if (hit === true) cls += ' hit';
    else if (hit === false) cls += ' dim';
    if (selected) cls += ' sel';
    return h('div', {
      key: cell.date,
      class: cls,
      style: cellColor(cell.value),
      'data-cat': catId,
      'data-date': cell.date,
    });
  }

  function Row({ cat, matchRow, threshold, selectedDate, cellCost }) {
    return h(
      'div',
      { key: cat.id, class: 'row' },
      h('div', { class: 'row-label' }, cat.name),
      cat.cells.map((cell, c) =>
        h(Cell, {
          key: cell.date,
          cell,
          catId: cat.id,
          hit: matchRow ? matchRow[c] : null,
          low: cell.value < threshold,
          selected: selectedDate === cell.date,
          cellCost,
        }),
      ),
    );
  }

  function Heatmap({ data, matches, threshold, selected, cellCost, onSelect }) {
    return h(
      'div',
      {
        id: 'heatmap',
        class: 'heatmap',
        style: `--cols:${DATE_COUNT}`,
        // 셀마다 핸들러를 달지 않고 컨테이너 하나에서 data 속성으로 셀을 찾는다.
        onClick: (event) => {
          const { cat, date } = /** @type {HTMLElement} */ (event.target).dataset ?? {};
          if (cat && date) onSelect(cat, date);
        },
      },
      data.categories.map((cat, r) =>
        h(Row, {
          key: cat.id,
          cat,
          matchRow: matches ? matches[r] : null,
          threshold,
          selectedDate: selected && selected.cat === cat.id ? selected.date : null,
          cellCost,
        }),
      ),
    );
  }

  function StatsPanel({ stats }) {
    return h(
      'dl',
      { class: 'stats' },
      h('dt', null, '전체 셀'),
      h('dd', null, stats.total.toLocaleString()),
      h('dt', null, '임계값 이상'),
      h('dd', null, `${stats.above.toLocaleString()} (평균 ${stats.aboveMean.toFixed(3)})`),
      h('dt', null, '검색 매칭'),
      h('dd', { id: 'match-count' }, stats.matched === null ? '-' : `${stats.matched.toLocaleString()} (평균 ${stats.matchedMean.toFixed(3)})`),
    );
  }

  function DetailPanel({ data, selected }) {
    const seq = selected ? String(selected.seq) : '0';
    if (!selected) {
      return h('section', { id: 'detail', class: 'detail', 'data-seq': seq, 'data-selected': '' }, '셀을 클릭하면 정보가 나옵니다.');
    }
    const cat = data.categories.find((c) => c.id === selected.cat);
    const cell = cat?.cells.find((c) => c.date === selected.date);
    return h(
      'section',
      { id: 'detail', class: 'detail', 'data-seq': seq, 'data-selected': `${selected.cat}|${selected.date}` },
      h('strong', null, `${cat ? cat.name : selected.cat} · ${selected.date}`),
      cell ? h('span', null, ` 값 ${cell.value.toFixed(3)} · 태그 ${cell.tag}`) : h('span', null, ' (데이터 재생성으로 사라진 셀)'),
    );
  }

  function ClickCounter({ count }) {
    return h('p', { id: 'click-count', class: 'click-count' }, `셀 클릭 ${count}회`);
  }

  /**
   * 루트. 상태는 여기만 가진다.
   * @param {{ size: number, seed: number, cellCost: number }} props
   */
  function App(props) {
    const [query, setQuery] = useState('');
    const [matchQuery, setMatchQuery] = useState('');
    const [threshold, setThreshold] = useState(0.2);
    const [size, setSize] = useState(() => clampSize(props.size));
    const [seed, setSeed] = useState(props.seed);
    const [selected, setSelected] = useState(/** @type {{cat: string, date: string, seq: number} | null} */ (null));

    const data = useMemo(() => generateData(size, seed), [size, seed]);
    const matches = useMemo(() => matchCells(data, matchQuery), [data, matchQuery]);
    const stats = useMemo(() => computeStats(data, matches, threshold), [data, matches, threshold]);

    useEffect(() => {
      document.title = selected ? `${selected.cat} ${selected.date} · ${BASE_TITLE}` : BASE_TITLE;
    }, [selected]);

    const onQuery = (value) => {
      setQuery(value);
      startTransition(() => setMatchQuery(value));
    };
    const onSelect = (cat, date) => setSelected((prev) => ({ cat, date, seq: (prev ? prev.seq : 0) + 1 }));

    return h(
      'div',
      { class: 'app' },
      h(
        'header',
        { class: 'toolbar' },
        h(SearchBar, { query, onQuery }),
        h(Controls, {
          threshold,
          size,
          seed,
          onThreshold: setThreshold,
          onSize: (n) => setSize(clampSize(n)),
          onRegenerate: () => setSeed((s) => s + 1),
        }),
      ),
      h(
        'aside',
        { class: 'side' },
        h(StatsPanel, { stats }),
        h(DetailPanel, { data, selected }),
        h(ClickCounter, { count: selected ? selected.seq : 0 }),
      ),
      h(Heatmap, { data, matches, threshold, selected, cellCost: props.cellCost, onSelect }),
    );
  }

  return { App, SearchBar, Controls, Heatmap, Row, Cell, StatsPanel, DetailPanel, ClickCounter };
}

/**
 * 진행 바. 히트맵과 별개인 두 번째 루트. requestAnimationFrame마다 setProgress로 위치를 바꾼다.
 * CSS 애니메이션은 쓰지 않는다 (컴포지터 스레드에서 돌아 메인 스레드 멈춤이 안 보이므로).
 * @param {ReturnType<import('../engine-adapter.js').createEngine>} engine
 */
export function createProgressApp(engine) {
  const { h, useState, useEffect } = engine;
  const PERIOD_MS = 2000;

  function ProgressApp() {
    const [progress, setProgress] = useState(0);
    useEffect(() => {
      let id = 0;
      const start = performance.now();
      const tick = (now) => {
        setProgress((((now - start) % PERIOD_MS) / PERIOD_MS) * 100);
        id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(id);
    }, []);
    return h(
      'div',
      { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round(progress) },
      h('div', { class: 'progress-thumb', style: `left:${progress.toFixed(2)}%` }),
    );
  }

  return { ProgressApp };
}
