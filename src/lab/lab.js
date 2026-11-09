/**
 * PatchLab — Phase 1 검증 페이지의 "두뇌".
 * 화면(버튼, 로그)은 모르고, 두 영역(실제/테스트)과 State History 만 다룬다.
 * 덕분에 브라우저 없이 jsdom 으로도 기능 테스트를 할 수 있다.
 *
 *   실제 영역(realRoot) : diff + patch 로만 갱신된다.  "화면에 보이는 진짜 DOM" 역할
 *   테스트 영역(testRoot): 사용자가 자유롭게 편집하는 곳 (contenteditable)
 *   History              : Patch 때마다 쌓이는 VNode 스냅샷. 항상 "실제 영역이 보여주는 상태" 를 가리킨다.
 *
 * Patch 흐름
 *   테스트 영역 DOM ─▶ 새 VNode ─▶ diff(현재 History VNode, 새 VNode) ─▶ patch(실제 영역) ─▶ History.push
 */

import { History } from '../vdom/history.js';
import { containerToVNode, htmlToVNode } from '../vdom/fromDOM.js';
import { diff } from '../vdom/diff.js';
import { patch } from '../vdom/patch.js';
import { render } from '../vdom/createDOM.js';
import { vnodeToHTML } from '../vdom/serialize.js';

export class PatchLab {
  #realRoot;
  #testRoot;
  #onChange;
  #history = null;

  /**
   * @param {object} deps
   * @param {Element} deps.realRoot  실제 영역 컨테이너
   * @param {Element} deps.testRoot  테스트 영역 컨테이너
   * @param {(node: Node, op: object) => void} [deps.onChange] patch 로 실제 DOM 이 바뀔 때마다 호출
   * @param {number} [deps.historyLimit]
   */
  constructor({ realRoot, testRoot, onChange, historyLimit = 100 }) {
    this.#realRoot = realRoot;
    this.#testRoot = testRoot;
    this.#onChange = onChange;
    this.historyLimit = historyLimit;
  }

  /**
   * 실제 영역의 샘플 HTML 을 VNode 로 변환하고, 그것으로 두 영역을 (다시) 렌더링한다.
   * 샘플 HTML 의 들여쓰기 공백 등은 VNode 변환에서 정규화되므로, 실제 영역도 VNode 로 다시 그려서
   * "DOM ↔ VNode 1:1 대응" 을 보장한다. (이후 patch 의 path 가 어긋나지 않는다)
   */
  init() {
    const initial = containerToVNode(this.#realRoot);
    render(initial, this.#realRoot);
    render(initial, this.#testRoot);
    this.#history = new History(this.#entry(initial, '초기 상태', 0), { limit: this.historyLimit });
    return initial;
  }

  #entry(vnode, label, opCount) {
    return { vnode, label, opCount };
  }

  get history() { return this.#history; }
  get current() { return this.#history.current.vnode; }

  get state() {
    const h = this.#history;
    return { index: h.index, length: h.length, canBack: h.canBack, canForward: h.canForward };
  }

  /** 테스트 영역의 현재 DOM 을 VNode 로 읽는다. */
  readTest() {
    return containerToVNode(this.#testRoot);
  }

  /**
   * 지금 Patch 하면 적용될 변경 목록 (미리보기). DOM 은 건드리지 않는다.
   * 글자를 쳤다가 지워서 원래대로 돌아오면 빈 배열이 된다.
   */
  pendingOps() {
    return diff(this.current, this.readTest());
  }

  /** 테스트 영역 내용을 HTML 코드로 (편집창 표시용) */
  getSource() {
    return vnodeToHTML(this.readTest(), { pretty: true });
  }

  /** 편집창의 HTML 코드를 테스트 영역에 반영한다. */
  setSource(html) {
    render(htmlToVNode(html), this.#testRoot);
  }

  /**
   * Patch 버튼: 테스트 영역과 현재 상태를 비교해 달라진 부분만 실제 영역에 반영한다.
   * @returns {{ changed: boolean, ops: object[], before: object, verified: boolean, recovered: boolean }}
   */
  patch() {
    const before = this.current;
    const next = this.readTest();
    const ops = diff(before, next);
    if (ops.length === 0) return { changed: false, ops, before, verified: true, recovered: false };

    const { verified, recovered } = this.#applyToReal(ops, next);
    this.#history.push(this.#entry(next, `Patch #${this.#history.index + 1}`, ops.length));
    return { changed: true, ops, before, verified, recovered };
  }

  back() { return this.#move(() => this.#history.back()); }
  forward() { return this.#move(() => this.#history.forward()); }

  goTo(index) {
    return this.#move(() => this.#history.goTo(index));
  }

  /**
   * 히스토리 이동. 실제 영역은 이전 상태 → 대상 상태를 diff + patch 로 맞추고,
   * 테스트 영역은 사용자가 편집하던 내용을 버리고 대상 상태로 다시 그린다.
   */
  #move(navigate) {
    const before = this.current;
    const entry = navigate();
    if (!entry) return null;
    const target = entry.vnode;
    const ops = diff(before, target);
    const { verified, recovered } = ops.length ? this.#applyToReal(ops, target) : { verified: true, recovered: false };
    render(target, this.#testRoot);
    return { ops, before, target, verified, recovered };
  }

  /**
   * ops 를 실제 영역에 적용하고 결과를 검증한다.
   * 만에 하나 patch 가 실패하거나 결과가 목표와 다르면 통째로 다시 그려서 복구한다.
   * (복구가 일어났다면 diff/patch 에 버그가 있다는 신호이므로 recovered 로 알린다)
   */
  #applyToReal(ops, target) {
    try {
      patch(this.#realRoot, ops, { onChange: this.#onChange });
      if (this.verify(target)) return { verified: true, recovered: false };
    } catch (err) {
      console.error('[PatchLab] patch 실패, 전체 렌더링으로 복구합니다.', err);
    }
    render(target, this.#realRoot);
    return { verified: false, recovered: true };
  }

  /**
   * 실제 영역의 DOM 을 다시 VNode 로 읽어서, 기대한 VNode 와 동일한지 확인한다.
   * liveState: false → 속성(attribute)만 비교한다. 실제 영역의 입력창에 사용자가 직접 친 값은
   * VNode 와 달라도 정상이므로(= Patch 가 건드리지 않고 보존해야 하는 값), 검증에서 제외한다.
   */
  verify(expected = this.current) {
    return diff(containerToVNode(this.#realRoot, { liveState: false }), expected).length === 0;
  }
}
