import { depsChanged, useHookSlot } from '../hookRuntime';
import type { MemoSlot } from '../hookRuntime';

/**
 * 계산 결과를 hooks 칸에 저장하고, deps가 같으면 다시 계산하지 않고 저장된 값을 돌려준다.
 * 계산은 렌더링 중에 즉시 한다. 계산 함수 안의 setState는 렌더링 중이므로 오류다.
 * - deps 없음: 매 렌더링 / []: 첫 렌더링에만 / [a, b]: 값이 바뀐 렌더링에만
 */
export function useMemo<T>(compute: () => T, deps?: readonly unknown[]): T {
  const { component, index, slot } = useHookSlot('memo');
  if (slot && !depsChanged(slot.deps, deps)) return slot.value as T;

  const value = compute();
  const next: MemoSlot = { kind: 'memo', deps, value };
  component.hooks[index] = next;
  return value;
}
