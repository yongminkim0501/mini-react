import { depsChanged, useHookSlot } from '../hookRuntime';
import type { EffectCallback, EffectSlot } from '../hookRuntime';

/**
 * 화면 반영 뒤에 실행할 작업을 등록한다. 렌더링 중에는 실행하지 않고 예약만 한다.
 * - deps 없음: 매 렌더링 후 / []: mount 후 1회 / [a, b]: 값이 바뀐 렌더링 후
 * deps는 실행할 때 저장한다. 렌더링이 오류로 끝나면 저장되지 않아야 하기 때문이다.
 */
export function useEffect(fn: EffectCallback, deps?: readonly unknown[]): void {
  const { component, index, slot } = useHookSlot('effect');
  let current = slot;
  if (!current) {
    const created: EffectSlot = { kind: 'effect', deps: undefined, cleanup: undefined };
    component.hooks[index] = created;
    current = created;
  }
  if (depsChanged(current.deps, deps)) {
    component.pendingEffects.push({ index, fn, deps });
  }
}
