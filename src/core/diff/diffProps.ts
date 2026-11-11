import type { PropValue } from '../html-to-vnode';
import type { PropsDiff } from './types';

/**
 * 속성 비교 (4단계). 차이가 없으면 null.
 * 이벤트 함수도 다른 값처럼 !==로 비교한다. 렌더링마다 새 함수면 set에 들어간다.
 * props는 프로토타입 없는 객체이므로 hasOwnProperty 대신 Object.hasOwn을 쓴다.
 */
export function diffProps(
  oldProps: Readonly<Record<string, PropValue>>,
  newProps: Readonly<Record<string, PropValue>>,
): PropsDiff | null {
  // 속성 이름이 __proto__여도 일반 키로 담기도록 프로토타입 없는 객체를 쓴다.
  const set: Record<string, PropValue> = Object.create(null);
  const remove: string[] = [];
  let changed = false;

  for (const [name, value] of Object.entries(newProps)) {
    if (!Object.hasOwn(oldProps, name) || oldProps[name] !== value) {
      set[name] = value;
      changed = true;
    }
  }
  for (const name of Object.keys(oldProps)) {
    if (!Object.hasOwn(newProps, name)) {
      remove.push(name);
      changed = true;
    }
  }

  return changed ? { set, remove } : null;
}
