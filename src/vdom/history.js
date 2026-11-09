/**
 * State History: Patch 할 때마다 쌓이는 스냅샷 목록과 현재 위치.
 * 브라우저 방문 기록처럼, 과거로 돌아간 뒤 새로 push 하면 "앞으로" 기록은 버려진다.
 */
export class History {
  #entries;
  #index;
  #limit;

  /**
   * @param {*} initial 첫 항목
   * @param {{ limit?: number }} [options] 최대 보관 개수 (넘으면 가장 오래된 것부터 버림)
   */
  constructor(initial, { limit = Infinity } = {}) {
    // NaN 이나 1.5 는 `limit < 1` 로는 걸러지지 않으므로 명시적으로 검사한다
    if (limit !== Infinity && !(Number.isInteger(limit) && limit >= 1)) {
      throw new RangeError('limit 은 1 이상의 정수 또는 Infinity 여야 합니다.');
    }
    this.#entries = [initial];
    this.#index = 0;
    this.#limit = limit;
  }

  get current() { return this.#entries[this.#index]; }
  get index() { return this.#index; }
  get length() { return this.#entries.length; }
  get canBack() { return this.#index > 0; }
  get canForward() { return this.#index < this.#entries.length - 1; }
  get entries() { return [...this.#entries]; }

  push(entry) {
    this.#entries.length = this.#index + 1; // 앞으로 기록 폐기
    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) this.#entries.shift();
    this.#index = this.#entries.length - 1;
    return entry;
  }

  /** 이동에 성공하면 새 현재 항목을, 더 갈 곳이 없으면 null 을 돌려준다. */
  back() { return this.canBack ? this.goTo(this.#index - 1) : null; }
  forward() { return this.canForward ? this.goTo(this.#index + 1) : null; }

  goTo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#entries.length) {
      throw new RangeError(`히스토리 범위를 벗어났습니다: ${index}`);
    }
    this.#index = index;
    return this.current;
  }
}
