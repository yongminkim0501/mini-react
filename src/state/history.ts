import type { VNode } from '../core/html-to-vnode';

export interface HistoryPosition {
  /** 1부터 시작하는 현재 위치. 비어 있으면 0. */
  readonly index: number;
  readonly total: number;
}

/**
 * Patch가 성공한 VNode를 순서대로 저장하고 뒤로/앞으로 이동한다.
 * VNode는 동결되어 있으므로 복사하지 않고 참조를 그대로 저장한다. DOM은 다루지 않는다.
 */
export class StateHistory<T extends VNode = VNode> {
  private readonly snapshots: T[] = [];
  /** 현재 보고 있는 스냅샷 인덱스. 비어 있으면 -1. */
  private cursor = -1;

  /** cursor 뒤의 기록을 버리고 vnode를 끝에 추가한 뒤 cursor를 끝으로 옮긴다. */
  push(vnode: T): void {
    // 과거로 돌아가 새로 수정하면 이전의 "미래"는 더 이상 이어지지 않는다.
    this.snapshots.length = this.cursor + 1;
    this.snapshots.push(vnode);
    this.cursor = this.snapshots.length - 1;
  }

  /** 한 칸 뒤로 이동해 그 VNode를 돌려준다. 처음 위치거나 비어 있으면 아무것도 바꾸지 않고 null. */
  back(): T | null {
    if (!this.canBack) return null;
    this.cursor -= 1;
    return this.at(this.cursor);
  }

  /** 한 칸 앞으로 이동해 그 VNode를 돌려준다. 마지막 위치거나 비어 있으면 아무것도 바꾸지 않고 null. */
  forward(): T | null {
    if (!this.canForward) return null;
    this.cursor += 1;
    return this.at(this.cursor);
  }

  get current(): T | null {
    return this.at(this.cursor);
  }

  get canBack(): boolean {
    return this.cursor > 0;
  }

  get canForward(): boolean {
    return this.cursor < this.snapshots.length - 1;
  }

  get position(): HistoryPosition {
    return { index: this.cursor + 1, total: this.snapshots.length };
  }

  private at(index: number): T | null {
    return this.snapshots[index] ?? null;
  }
}
