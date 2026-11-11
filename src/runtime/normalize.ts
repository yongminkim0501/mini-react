import type { VText } from '../core/html-to-vnode';
import type { HNode, PropValue } from './types';

function isNode(value: unknown): value is HNode {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'text' || kind === 'element' || kind === 'component';
}

function text(value: string): VText {
  return Object.freeze({ kind: 'text', text: value });
}

/**
 * children 정리 (1단계).
 * 배열은 끝까지 펼치고, 문자열·숫자는 텍스트로, null·undefined·불리언·빈 문자열은 버린다.
 * Phase 1 VNode는 인접 텍스트를 허용하지 않으므로 연속 텍스트는 하나로 합친다.
 */
export function normalizeChildren(values: readonly unknown[]): HNode[] {
  const result: HNode[] = [];
  let pending = '';

  const flushText = () => {
    if (pending !== '') result.push(text(pending));
    pending = '';
  };

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      pending += String(value);
    } else if (value === null || value === undefined || typeof value === 'boolean') {
      // 조건 && h(...) 패턴을 위해 그리지 않는다.
    } else if (isNode(value)) {
      if (value.kind === 'text') {
        pending += value.text;
      } else {
        flushText();
        result.push(value);
      }
    } else {
      throw new TypeError(`자식으로 쓸 수 없는 값입니다: ${Object.prototype.toString.call(value)}`);
    }
  };

  visit(values);
  flushText();
  return result;
}

export function isEventName(name: string): boolean {
  return name.length > 2 && name.startsWith('on');
}

/**
 * 요소 props 정리 (3단계).
 * 문자열은 그대로, 숫자는 문자열로, true는 빈 문자열(불리언 속성)로 바꾼다.
 * 함수는 on으로 시작할 때만 이벤트로 남기고, on으로 시작하는 문자열은 인라인 스크립트라 버린다.
 * key와 children은 h()가 따로 다루므로 여기서는 버린다.
 */
export function normalizeProps(props: Readonly<Record<string, unknown>> | null | undefined): Record<string, PropValue> {
  // Phase 1과 같이 __proto__도 일반 키로 담기도록 프로토타입 없는 객체를 쓴다.
  const result: Record<string, PropValue> = Object.create(null);
  if (!props) return result;

  for (const [name, value] of Object.entries(props)) {
    if (name === 'key' || name === 'children') continue;
    const event = isEventName(name);
    if (typeof value === 'function') {
      if (event) result[name] = value as PropValue;
    } else if (event) {
      continue;
    } else if (typeof value === 'string') {
      result[name] = value;
    } else if (typeof value === 'number') {
      result[name] = String(value);
    } else if (value === true) {
      result[name] = '';
    }
    // false, null, undefined, 객체는 속성으로 내보내지 않는다.
  }
  return result;
}

/** props.key를 문자열 key로 꺼낸다. 없으면 undefined. */
export function extractKey(props: Readonly<Record<string, unknown>> | null | undefined): string | undefined {
  const key = props?.key;
  if (key === undefined || key === null) return undefined;
  return String(key);
}
