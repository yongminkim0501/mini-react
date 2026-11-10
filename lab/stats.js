/**
 * 순수 통계 함수. DOM과 시간에 의존하지 않는다.
 */

/**
 * 백분위수. 정렬한 뒤 선형 보간한다 (엑셀 PERCENTILE.INC와 같은 방식).
 * 빈 배열이면 NaN.
 * @param {readonly number[]} values
 * @param {number} p 0~100
 * @returns {number}
 */
export function percentile(values, p) {
  if (values.length === 0) return NaN;
  if (p <= 0) return Math.min(...values);
  const sorted = [...values].sort((a, b) => a - b);
  if (p >= 100) return sorted[sorted.length - 1];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/** @param {readonly number[]} values */
export function mean(values) {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** @param {readonly number[]} values */
export function max(values) {
  if (values.length === 0) return NaN;
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return m;
}

/**
 * 요약 통계 한 묶음
 * @param {readonly number[]} values
 */
export function summarize(values) {
  return {
    count: values.length,
    mean: mean(values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: max(values),
  };
}

/**
 * 여러 실행 결과(같은 모양의 숫자 객체)의 평균. NaN은 빼고 평균한다.
 * @param {readonly Record<string, number>[]} runs
 * @returns {Record<string, number>}
 */
export function averageRuns(runs) {
  /** @type {Record<string, number>} */
  const result = {};
  if (runs.length === 0) return result;
  for (const key of Object.keys(runs[0])) {
    const values = runs.map((r) => r[key]).filter((v) => typeof v === 'number' && !Number.isNaN(v));
    result[key] = values.length ? mean(values) : NaN;
  }
  return result;
}
