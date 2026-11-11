import { useHookSlot } from '../hookRuntime';
import type { StateSlot } from '../hookRuntime';
import { scheduleUpdate } from './scheduler';

export type SetStateAction<T> = T | ((previous: T) => T);
export type SetState<T> = (next: SetStateAction<T>) => void;

export const SET_STATE_DURING_RENDER = '렌더링 중에는 setState를 호출할 수 없습니다';

/**
 * 상태 값을 hooks 칸에 저장한다. setState는 첫 렌더링에서 한 번만 만들고 이후에도 같은 함수를 돌려준다.
 * 초기값이 함수면 첫 렌더링에서만 실행한다.
 */
export function useState<T>(initial: T | (() => T)): [T, SetState<T>] {
  const { component, index, slot } = useHookSlot('state');
  if (slot) return [slot.value as T, slot.setState as SetState<T>];

  const value = typeof initial === 'function' ? (initial as () => T)() : initial;

  const setState: SetState<T> = (next) => {
    // 렌더링 중에 바꾸면 다시 렌더링 → 다시 변경으로 끝없이 반복된다.
    if (component.isRendering) throw new Error(SET_STATE_DURING_RENDER);
    // unmount 후에는 칸이 없으므로 무시한다.
    const current = component.hooks[index];
    if (!component.isMounted || current?.kind !== 'state' || current.setState !== setState) return;

    const newValue = typeof next === 'function' ? (next as (previous: T) => T)(current.value as T) : next;
    // 같은 값이면 화면도 같으므로 렌더링하지 않는다.
    if (Object.is(newValue, current.value)) return;
    current.value = newValue;
    scheduleUpdate(component);
  };

  const created: StateSlot = { kind: 'state', value, setState: setState as (next: unknown) => void };
  component.hooks[index] = created;
  return [value, setState];
}
