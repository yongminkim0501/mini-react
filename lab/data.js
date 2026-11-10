import { mulberry32, randInt } from './prng.js';

/**
 * 장애 대응 모니터링 데이터: 서버 × 최근 100분, 셀 값은 그 분의 p95 지연(ms).
 * 시드로 장애 시나리오를 심는다.
 * - 평소: 서버마다 낮은 기준 지연 + 잡음, 드물게 err-504.
 * - ROLLOUT_START분부터 deploy-1742가 서버 묶음 단위로 계단식(rolling deploy)으로 퍼진다.
 * - 그 배포를 받은 서버 일부(AFFECTED_RATIO)에서 지연이 오르고 err-503이 난다.
 *
 * 이 파일은 stack 기준선(baseline-stack) 이후 수정하지 않는다 (docs/decisions.md D-A27).
 */

/** 분(열) 수는 고정하고 서버(행) 수로 셀 수를 맞춘다. */
export const MINUTE_COUNT = 100;
export const MIN_SIZE = 2000;
export const MAX_SIZE = 20000;
export const SIZE_STEP = 1000;

export const OLD_VERSION = 'deploy-1741';
export const NEW_VERSION = 'deploy-1742';
export const ROLLOUT_START = 40;
/** 몇 분마다 다음 묶음에 배포하는지 */
export const ROLLOUT_STEP_MINUTES = 3;
/** 묶음 수. 마지막 묶음은 ROLLOUT_START + (WAVES-1)*STEP분에 배포된다. */
export const ROLLOUT_WAVES = 12;
export const AFFECTED_RATIO = 0.35;
/** 지연 색 단계의 상한. 이보다 크면 가장 진한 색이다. */
export const LATENCY_CAP_MS = 1200;

const REGIONS = ['ne', 'nw', 'se', 'sw', 'c'];
const START_HOUR = 14;

/** 셀 수를 허용 범위·단계로 맞춘다. */
export function clampSize(size) {
  const n = Number.isFinite(size) ? size : 20000;
  const stepped = Math.round(n / SIZE_STEP) * SIZE_STEP;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, stepped));
}

/** 14:00부터 1분씩. 키로 쓰므로 문자열이다. */
export function minuteLabel(index) {
  const total = START_HOUR * 60 + index;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** web-ne-07처럼 지역별 번호를 붙인다. */
function serverName(index) {
  const region = REGIONS[index % REGIONS.length];
  const n = Math.floor(index / REGIONS.length) + 1;
  return `web-${region}-${String(n).padStart(2, '0')}`;
}

/** 정규분포 근사 잡음 (균등분포 3개 합) */
function noise(rand) {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

/**
 * @param {number} size 셀 수 (clampSize 적용)
 * @param {number} seed
 */
export function generateData(size, seed) {
  const total = clampSize(size);
  const rowCount = total / MINUTE_COUNT;
  const rand = mulberry32(seed);
  const minutes = Array.from({ length: MINUTE_COUNT }, (_, i) => minuteLabel(i));

  // 배포 순서: 서버를 섞어 묶음으로 나눈다 (Fisher–Yates).
  const order = Array.from({ length: rowCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const deployAt = new Array(rowCount);
  order.forEach((server, position) => {
    const wave = Math.floor((position * ROLLOUT_WAVES) / rowCount);
    deployAt[server] = ROLLOUT_START + wave * ROLLOUT_STEP_MINUTES;
  });

  const servers = [];
  for (let r = 0; r < rowCount; r++) {
    const name = serverName(r);
    const baseline = 60 + rand() * 90; // 60~150ms
    const affected = rand() < AFFECTED_RATIO;
    // 영향받는 서버는 배포 후 몇 분에 걸쳐 지연이 오른다.
    const peak = 350 + rand() * 650;
    const rampMinutes = 2 + randInt(rand, 5);
    const cells = new Array(MINUTE_COUNT);
    for (let m = 0; m < MINUTE_COUNT; m++) {
      const deployed = m >= deployAt[r];
      let latency = baseline * (1 + 0.15 * noise(rand));
      let status = rand() < 0.004 ? 'err-504' : 'ok';
      if (deployed && affected) {
        const progress = Math.min(1, (m - deployAt[r] + 1) / rampMinutes);
        latency += peak * progress * (0.85 + 0.3 * rand());
        if (rand() < 0.25 + 0.5 * progress) status = 'err-503';
      }
      const value = Math.max(5, Math.round(latency));
      cells[m] = { minute: minutes[m], value, version: deployed ? NEW_VERSION : OLD_VERSION, status, tag: `${deployed ? NEW_VERSION : OLD_VERSION} ${status}` };
    }
    servers.push({ id: name, name, deployAt: deployAt[r], affected, cells });
  }
  return { seed, size: total, minutes, servers };
}

/**
 * 검색 매칭. 빈 검색어면 null(강조 없음). 결과는 행마다 boolean 배열.
 * 태그("deploy-1742 err-503")의 부분 문자열로 찾는다.
 * @param {ReturnType<typeof generateData>} data
 * @param {string} query
 */
export function matchCells(data, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return null;
  return data.servers.map((server) => server.cells.map((cell) => cell.tag.includes(q)));
}

/**
 * 통계: SLO 초과 셀 수와 평균 지연, 매칭 셀 수와 평균 지연.
 * @param {ReturnType<typeof generateData>} data
 * @param {boolean[][] | null} matches
 * @param {number} slo SLO 기준(ms). 이 값을 넘으면 위반이다.
 */
export function computeStats(data, matches, slo) {
  let breach = 0;
  let breachSum = 0;
  let matched = 0;
  let matchedSum = 0;
  data.servers.forEach((server, r) => {
    server.cells.forEach((cell, c) => {
      if (cell.value > slo) {
        breach++;
        breachSum += cell.value;
      }
      if (matches?.[r][c]) {
        matched++;
        matchedSum += cell.value;
      }
    });
  });
  return {
    total: data.size,
    breach,
    breachMean: breach ? breachSum / breach : 0,
    matched: matches ? matched : null,
    matchedMean: matched ? matchedSum / matched : 0,
  };
}
