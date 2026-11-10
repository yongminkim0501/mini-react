/**
 * 배포 지연 추적 화면(서버 × 최근 100분 p95 지연). 화면은 전부 이 저장소의 미니 React로 그린다.
 * 배포 직후 지연 상승과 원인 후보(배포 버전, 에러 코드)가 시간·서버 축에서 겹치는지 눈으로 확인하는 장애 대응 화면이다.
 * 과제 제약: Hook은 루트 App에서만, 자식은 props만 받는 순수 함수.
 * 엔진을 바꿔 끼울 수 있도록 h·Hook은 engine 객체에서 받는다.
 */
import { startTransition } from '../engine-adapter.js';
import {
  LATENCY_CAP_MS,
  MAX_SIZE,
  MINUTE_COUNT,
  MIN_SIZE,
  SIZE_STEP,
  clampSize,
  computeStats,
  generateData,
  matchCells,
  minuteLabel,
} from '../data.js';
import { burn } from '../load.js';

export const BASE_TITLE = '배포 지연 추적 · mini-react lab';
export const SLO_MIN = 100;
export const SLO_MAX = 1000;
export const SLO_STEP = 50;
export const SLO_DEFAULT = 300;

/** p95 지연(ms) → 배경색. 낮으면 옅은 파랑, LATENCY_CAP_MS 이상이면 진한 빨강. 제곱근이라 낮은 구간 차이도 보인다. */
export function cellColor(ms) {
  const level = Math.sqrt(Math.min(1, ms / LATENCY_CAP_MS));
  const hue = Math.round(210 - level * 210);
  const light = Math.round(88 - level * 46);
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
      h('label', { for: 'search' }, '배포·에러 검색'),
      h('input', {
        id: 'search',
        type: 'text',
        autocomplete: 'off',
        placeholder: '예: deploy-1742 err-503',
        value: query,
        onInput: (event) => onQuery(event.target.value),
      }),
      h('span', { class: 'echo-label' }, '입력값'),
      h('output', { id: 'echo', class: 'echo' }, query),
    );
  }

  function Controls({ slo, size, seed, onSlo, onSize, onRegenerate }) {
    return h(
      'div',
      { class: 'controls' },
      h(
        'label',
        { class: 'control' },
        h('span', null, `SLO 기준 ${slo}ms`),
        h('input', {
          id: 'slo',
          type: 'range',
          min: SLO_MIN,
          max: SLO_MAX,
          step: SLO_STEP,
          value: String(slo),
          onInput: (event) => onSlo(Number(event.target.value)),
        }),
      ),
      h(
        'label',
        { class: 'control' },
        h('span', null, `셀 수 ${size.toLocaleString()} (서버 ${size / MINUTE_COUNT}대)`),
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
      h('button', { id: 'regen', type: 'button', onClick: onRegenerate }, `새 데이터 수신 (seed ${seed})`),
    );
  }

  function Cell({ cell, serverId, hit, low, selected, cellCost }) {
    if (cellCost > 0) burn(cellCost);
    let cls = 'cell';
    if (low) cls += ' low';
    if (hit === true) cls += ' hit';
    else if (hit === false) cls += ' dim';
    if (selected) cls += ' sel';
    return h('div', {
      key: cell.minute,
      class: cls,
      style: cellColor(cell.value),
      'data-server': serverId,
      'data-minute': cell.minute,
    });
  }

  function Row({ server, matchRow, slo, selectedMinute, cellCost }) {
    return h(
      'div',
      { key: server.id, class: 'row' },
      h('div', { class: 'row-label' }, server.name),
      server.cells.map((cell, c) =>
        h(Cell, {
          key: cell.minute,
          cell,
          serverId: server.id,
          hit: matchRow ? matchRow[c] : null,
          // SLO 안쪽(정상) 셀은 흐리게 해서 위반 구간이 드러나게 한다.
          low: cell.value <= slo,
          selected: selectedMinute === cell.minute,
          cellCost,
        }),
      ),
    );
  }

  function Heatmap({ data, matches, slo, selected, cellCost, onSelect }) {
    return h(
      'div',
      {
        id: 'heatmap',
        class: 'heatmap',
        style: `--cols:${MINUTE_COUNT}`,
        // 셀마다 핸들러를 달지 않고 컨테이너 하나에서 data 속성으로 셀을 찾는다.
        onClick: (event) => {
          const { server, minute } = /** @type {HTMLElement} */ (event.target).dataset ?? {};
          if (server && minute) onSelect(server, minute);
        },
      },
      data.servers.map((server, r) =>
        h(Row, {
          key: server.id,
          server,
          matchRow: matches ? matches[r] : null,
          slo,
          selectedMinute: selected && selected.server === server.id ? selected.minute : null,
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
      h('dt', null, 'SLO 초과'),
      h('dd', null, `${stats.breach.toLocaleString()} (평균 ${Math.round(stats.breachMean)}ms)`),
      h('dt', null, '검색 매칭'),
      h('dd', { id: 'match-count' }, stats.matched === null ? '-' : `${stats.matched.toLocaleString()} (평균 ${Math.round(stats.matchedMean)}ms)`),
    );
  }

  function DetailPanel({ data, selected }) {
    const seq = selected ? String(selected.seq) : '0';
    if (!selected) {
      return h('section', { id: 'detail', class: 'detail', 'data-seq': seq, 'data-selected': '' }, '셀을 클릭하면 그 서버·시각의 지연과 배포 정보가 나옵니다.');
    }
    const server = data.servers.find((s) => s.id === selected.server);
    const cell = server?.cells.find((c) => c.minute === selected.minute);
    return h(
      'section',
      { id: 'detail', class: 'detail', 'data-seq': seq, 'data-selected': `${selected.server}|${selected.minute}` },
      h('strong', null, `${selected.server} · ${selected.minute}`),
      cell && server
        ? h(
            'dl',
            { class: 'detail-list' },
            h('dt', null, 'p95 지연'),
            h('dd', null, `${cell.value}ms`),
            h('dt', null, '버전'),
            h('dd', null, cell.version),
            h('dt', null, '상태'),
            h('dd', null, cell.status),
            h('dt', null, '배포 시각'),
            h('dd', null, minuteLabel(server.deployAt)),
          )
        : h('span', null, ' (새 데이터 수신으로 사라진 셀)'),
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
    const [slo, setSlo] = useState(SLO_DEFAULT);
    const [size, setSize] = useState(() => clampSize(props.size));
    const [seed, setSeed] = useState(props.seed);
    const [selected, setSelected] = useState(/** @type {{server: string, minute: string, seq: number} | null} */ (null));

    const data = useMemo(() => generateData(size, seed), [size, seed]);
    const matches = useMemo(() => matchCells(data, matchQuery), [data, matchQuery]);
    const stats = useMemo(() => computeStats(data, matches, slo), [data, matches, slo]);

    useEffect(() => {
      document.title = selected ? `${selected.server} ${selected.minute} · ${BASE_TITLE}` : BASE_TITLE;
    }, [selected]);

    const onQuery = (value) => {
      setQuery(value);
      startTransition(() => setMatchQuery(value));
    };
    const onSelect = (server, minute) => setSelected((prev) => ({ server, minute, seq: (prev ? prev.seq : 0) + 1 }));

    return h(
      'div',
      { class: 'app' },
      h(
        'header',
        { class: 'toolbar' },
        h(SearchBar, { query, onQuery }),
        h(Controls, {
          slo,
          size,
          seed,
          onSlo: setSlo,
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
      h(Heatmap, { data, matches, slo, selected, cellCost: props.cellCost, onSelect }),
    );
  }

  return { App, SearchBar, Controls, Heatmap, Row, Cell, StatsPanel, DetailPanel, ClickCounter };
}

/**
 * 진행 바("실시간 수신 표시"). 히트맵과 별개인 두 번째 루트. requestAnimationFrame마다 setProgress로 위치를 바꾼다.
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
