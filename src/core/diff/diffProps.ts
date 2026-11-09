import type { PropsDiff } from './types';

/**
 * 속성 비교 (4단계). 차이가 없으면 null.
 * props는 프로토타입 없는 객체이므로 hasOwnProperty 대신 Object.hasOwn을 쓴다.
 */
export function diffProps(
  oldProps: Readonly<Record<string, string>>,
  newProps: Readonly<Record<string, string>>,
): PropsDiff | null {
  // 속성 이름이 __proto__여도 일반 키로 담기도록 프로토타입 없는 객체를 쓴다.
  const set: Record<string, string> = Object.create(null);
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
