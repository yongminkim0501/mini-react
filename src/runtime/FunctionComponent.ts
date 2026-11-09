import { diff } from '../core/diff';
import type { Patch } from '../core/diff';
import type { VElement } from '../core/html-to-vnode';
import { applyPatches } from '../core/patch';
import { mount as mountDom } from '../core/vnode-to-dom';
import { beginRender, endRender } from './hookRuntime';
import type { HookHost, HookSlot, PendingEffect } from './hookRuntime';
import { resolve } from './resolve';
import type { Component, ComponentProps } from './types';

export type CommitListener = (patches: readonly Patch[], vnode: VElement) => void;

/**
 * 루트 함수형 컴포넌트를 감싸고 Hook 상태를 보관한다.
 * 함수는 렌더링마다 새로 실행되지만 hooks 배열은 인스턴스에 남아 상태가 유지된다.
 * 컨테이너는 이 인스턴스만 수정한다. 다른 코드가 고치면 DOM과 vnode가 어긋난다.
 */
export class FunctionComponent<P extends object = Record<string, never>> implements HookHost {
  /** Hook 상태. 칸 하나 = Hook 호출 하나, 호출 순서가 곧 칸 번호다. */
  hooks: HookSlot[] = [];
  /** 마지막으로 화면에 반영된 #root VNode */
  vnode: VElement | null = null;
  /** 이번 렌더링 후 실행할 effect */
  pendingEffects: PendingEffect[] = [];
  isMounted = false;
  /** 렌더링 중 setState를 막는 데 쓴다. */
  isRendering = false;
  /** 반영 직후 호출. 디버그 패널이 Patch 목록을 받는다. mount는 빈 배열을 넘긴다. */
  onCommit: CommitListener | undefined;

  readonly fn: Component<P>;
  readonly container: Element;
  readonly props: P;

  /** 직전 성공한 렌더링의 Hook 개수. 다르면 조건문 안에서 Hook을 부른 것이다. */
  private hookCount: number | null = null;

  constructor(fn: Component<P>, container: Element, props?: P) {
    this.fn = fn;
    this.container = container;
    this.props = props ?? ({} as P);
  }

  /** 처음 렌더링. 컨테이너 내용을 통째로 교체한다. */
  mount(): void {
    if (this.isMounted) return;
    let vnode: VElement;
    try {
      vnode = this.render();
    } catch (error) {
      this.hooks = [];
      this.hookCount = null;
      console.error('[FunctionComponent] 첫 렌더링 오류', error);
      return;
    }
    mountDom(this.container, vnode);
    this.commit([], vnode);
  }

  /** 다시 렌더링해서 바뀐 부분만 반영한다. 렌더링 오류면 이전 화면을 유지한다. */
  update(): void {
    if (!this.isMounted || this.isRendering || !this.vnode) return;
    let next: VElement;
    try {
      next = this.render();
    } catch (error) {
      console.error('[FunctionComponent] 렌더링 오류. 이전 화면을 유지합니다.', error);
      return;
    }

    const patches = diff(this.vnode, next);
    let ok = false;
    try {
      ok = applyPatches(this.container, patches).ok;
    } catch {
      ok = false;
    }
    // 대상을 못 찾았거나 반영 중 예외가 나면 새 VNode로 다시 그려 DOM과 vnode를 맞춘다.
    if (!ok) mountDom(this.container, next);
    this.commit(patches, next);
  }

  /** 컨테이너를 비우고 상태를 버린다. 이후 setState는 무시된다. */
  unmount(): void {
    if (!this.isMounted) return;
    this.container.replaceChildren();
    this.hooks = [];
    this.hookCount = null;
    this.pendingEffects = [];
    this.vnode = null;
    this.isMounted = false;
  }

  /** 렌더링 1회: 실행 → 펼치기. 자식 컴포넌트도 Hook 실행 환경 안에서 펼쳐야 자식 Hook을 막을 수 있다. */
  private render(): VElement {
    const previousLength = this.hooks.length;
    this.pendingEffects = [];
    this.isRendering = true;
    beginRender(this);

    let vnode: VElement | undefined;
    let failure: unknown;
    let count = 0;
    try {
      const props = Object.freeze({ ...this.props, children: [] }) as ComponentProps<P>;
      vnode = resolve(this.fn(props));
    } catch (error) {
      failure = error;
    } finally {
      count = endRender();
      this.isRendering = false;
    }

    if (failure === undefined && this.hookCount !== null && count !== this.hookCount) {
      failure = new Error(
        `Hook 호출 개수가 바뀌었습니다 (이전 ${this.hookCount}개, 이번 ${count}개). 조건문·반복문 안에서 Hook을 호출하지 마세요.`,
      );
    }
    if (failure !== undefined || !vnode) {
      // 실패한 렌더링에서 새로 만든 칸과 예약한 effect는 버린다.
      this.hooks.length = previousLength;
      this.pendingEffects = [];
      throw failure;
    }

    this.hookCount = count;
    return vnode;
  }

  private commit(patches: readonly Patch[], vnode: VElement): void {
    this.vnode = vnode;
    this.isMounted = true;
    try {
      this.onCommit?.(patches, vnode);
    } catch (error) {
      console.error('[FunctionComponent] onCommit 오류', error);
    }
    this.flushEffects();
  }

  /** 반영 후 effect 실행. 07 useEffect에서 구현한다. */
  private flushEffects(): void {
    this.pendingEffects = [];
  }
}
