import type { Patch } from '../diff';
import { commit } from './commit';
import { resolveAll } from './resolve';

export interface ApplyResult {
  readonly ok: boolean;
  /** Patch마다 변경된 요소. 같은 요소가 여러 번 들어갈 수 있다. */
  readonly changed: readonly Element[];
}

/**
 * Patch 목록을 실제 영역 DOM에 반영한다.
 * 경로는 이전 트리 기준이므로 모든 대상을 먼저 찾은 뒤 적용해 인덱스 밀림을 막는다.
 * 하나라도 못 찾으면 아무것도 수정하지 않고 ok: false를 돌려준다.
 * 전제: 컨테이너 DOM과 이전 VNode가 1:1로 일치한다 (정규화 마운트 완료).
 */
export function applyPatches(container: Element, patches: readonly Patch[]): ApplyResult {
  const resolved = resolveAll(container, patches);
  if (!resolved) return { ok: false, changed: [] };

  const changed: Element[] = [];
  for (const item of resolved) {
    const element = commit(item);
    if (element) changed.push(element);
  }
  return { ok: true, changed };
}
