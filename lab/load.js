/**
 * 인공 CPU 부하. 기본은 쓰지 않는다. 자연 비용이 부족할 때만 ?cellCost=0.01처럼 셀당 비용을 얹는다.
 *
 * - calibrate(): 이 기기에서 1ms 동안 도는 반복 횟수를 잰다. 시간은 루프 밖에서만 잰다.
 * - burn(ms): 보정값만큼 정수 연산을 반복한다. 루프 안에서 performance.now()를 부르지 않는다.
 *   부르면 시계 호출 자체가 비용이 되고, 타이머 정밀도 제한(브라우저 보안 정책)에 결과가 흔들린다.
 * - 결과를 돌려주고 sink에 섞어 최적화로 루프가 사라지지 않게 한다.
 */

let iterationsPerMs = 0;
let sink = 0;

/** 정수 해시 반복. 결과에 의존하는 연산이라 컴파일러가 지울 수 없다. */
function spin(iterations, seed) {
  let x = seed | 0;
  for (let i = 0; i < iterations; i++) {
    x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) + i;
  }
  return x;
}

/**
 * 1ms당 반복 횟수를 잰다. 여러 번 재서 중앙값을 쓴다.
 * @param {{ samples?: number, iterations?: number }} [options]
 * @returns {number}
 */
export function calibrate({ samples = 5, iterations = 2_000_000 } = {}) {
  spin(iterations, 1); // 워밍업 (JIT)
  const rates = [];
  for (let s = 0; s < samples; s++) {
    const start = performance.now();
    sink ^= spin(iterations, s);
    const elapsed = performance.now() - start;
    rates.push(iterations / Math.max(elapsed, 0.001));
  }
  rates.sort((a, b) => a - b);
  iterationsPerMs = rates[Math.floor(rates.length / 2)];
  return iterationsPerMs;
}

/** 보정값. calibrate 전이면 0. */
export function getCalibration() {
  return iterationsPerMs;
}

/**
 * 약 ms 밀리초 동안 CPU를 쓴다. calibrate를 먼저 부르지 않았으면 이때 한 번 보정한다.
 * @param {number} ms
 * @returns {number} 연산 결과 (버리지 말고 sink로 쓰라는 뜻)
 */
export function burn(ms) {
  if (!(ms > 0)) return 0;
  if (iterationsPerMs === 0) calibrate();
  const result = spin(Math.round(ms * iterationsPerMs), ms * 1000);
  sink ^= result;
  return result;
}

/** 누적 결과. 테스트나 디버그에서 읽어 루프가 살아 있음을 보장한다. */
export function getSink() {
  return sink;
}
