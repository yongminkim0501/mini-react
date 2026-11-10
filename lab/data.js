import { mulberry32, pick, randInt } from './prng.js';

/** 날짜(열) 수는 고정하고 카테고리(행) 수로 셀 수를 맞춘다. */
export const DATE_COUNT = 100;
export const MIN_SIZE = 2000;
export const MAX_SIZE = 20000;
export const SIZE_STEP = 1000;

const REGIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];
const PRODUCTS = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'sigma'];

/** 셀 수를 허용 범위·단계로 맞춘다. */
export function clampSize(size) {
  const n = Number.isFinite(size) ? size : 10000;
  const stepped = Math.round(n / SIZE_STEP) * SIZE_STEP;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, stepped));
}

/** 2026-01-01부터 하루씩. 키로 쓰므로 문자열이다. */
function dateLabel(index) {
  const d = new Date(Date.UTC(2026, 0, 1 + index));
  return d.toISOString().slice(0, 10);
}

/**
 * 시드 기반 "카테고리 × 날짜" 격자.
 * 셀: { date, value(0~1), tag } — tag는 "region-product-0000" 형태라 부분 문자열 검색이 점점 좁혀진다.
 * @param {number} size 셀 수 (clampSize 적용)
 * @param {number} seed
 */
export function generateData(size, seed) {
  const total = clampSize(size);
  const rows = total / DATE_COUNT;
  const rand = mulberry32(seed);
  const dates = Array.from({ length: DATE_COUNT }, (_, i) => dateLabel(i));

  const categories = [];
  for (let r = 0; r < rows; r++) {
    const id = `c${String(r).padStart(3, '0')}`;
    // 행마다 기준값을 두고 날짜에 따라 출렁이게 해서 히트맵에 줄무늬가 보이게 한다.
    const base = rand();
    const cells = new Array(DATE_COUNT);
    for (let c = 0; c < DATE_COUNT; c++) {
      const wave = 0.5 + 0.5 * Math.sin((c + r * 7) / 9);
      const value = Math.min(1, Math.max(0, base * 0.5 + wave * 0.3 + rand() * 0.2));
      const tag = `${pick(rand, REGIONS)}-${pick(rand, PRODUCTS)}-${String(randInt(rand, 10000)).padStart(4, '0')}`;
      cells[c] = { date: dates[c], value, tag };
    }
    categories.push({ id, name: `카테고리 ${r + 1}`, cells });
  }
  return { seed, size: total, dates, categories };
}

/**
 * 검색 매칭. 빈 검색어면 null(강조 없음). 결과는 행마다 boolean 배열.
 * @param {ReturnType<typeof generateData>} data
 * @param {string} query
 */
export function matchCells(data, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return null;
  return data.categories.map((cat) => cat.cells.map((cell) => cell.tag.includes(q)));
}

/**
 * 통계: 임계값 이상 셀 수와 평균, 매칭 셀 수와 평균.
 * @param {ReturnType<typeof generateData>} data
 * @param {boolean[][] | null} matches
 * @param {number} threshold
 */
export function computeStats(data, matches, threshold) {
  let above = 0;
  let aboveSum = 0;
  let matched = 0;
  let matchedSum = 0;
  data.categories.forEach((cat, r) => {
    cat.cells.forEach((cell, c) => {
      if (cell.value >= threshold) {
        above++;
        aboveSum += cell.value;
      }
      if (matches?.[r][c]) {
        matched++;
        matchedSum += cell.value;
      }
    });
  });
  return {
    total: data.size,
    above,
    aboveMean: above ? aboveSum / above : 0,
    matched: matches ? matched : null,
    matchedMean: matched ? matchedSum / matched : 0,
  };
}
