/**
 * 최장 증가 부분 수열(LIS). O(n log n).
 *
 * key 기반 자식 재정렬에서 "움직이지 않아도 되는 노드"의 최대 집합을 구하는 데 쓴다.
 * 이전 인덱스들을 새 순서대로 나열했을 때, 이미 오름차순인 가장 긴 부분이
 * 서로의 상대 위치가 맞는 노드들이므로 나머지만 옮기면 이동 횟수가 최소가 된다.
 *
 * @param {number[]} arr 서로 다른 값들의 배열
 * @returns {Set<number>} LIS 를 이루는 원소들의 "배열 내 위치(index)" 집합
 */
export function longestIncreasingSubsequence(arr) {
  const tails = []; // tails[k] = 길이 k+1 인 증가 수열의 마지막 원소가 있는 위치
  const prev = new Array(arr.length).fill(-1);

  for (let i = 0; i < arr.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[tails[mid]] < arr[i]) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }

  const result = new Set();
  for (let k = tails.length ? tails[tails.length - 1] : -1; k !== -1; k = prev[k]) result.add(k);
  return result;
}
