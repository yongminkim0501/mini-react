/**
 * 시드 기반 의사 난수 생성기 (mulberry32).
 * 같은 시드면 같은 수열을 돌려준다. 측정 재현을 위해 lab의 모든 무작위성은 이 함수를 거친다.
 * @param {number} seed 32비트 정수로 잘린다.
 * @returns {() => number} [0, 1) 범위의 수를 돌려주는 함수
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * [0, n) 정수
 * @param {() => number} rand
 * @param {number} n
 */
export function randInt(rand, n) {
  return Math.floor(rand() * n);
}

/**
 * 배열에서 하나 고른다.
 * @template T
 * @param {() => number} rand
 * @param {readonly T[]} items
 * @returns {T}
 */
export function pick(rand, items) {
  return items[randInt(rand, items.length)];
}
