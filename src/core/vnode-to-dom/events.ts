import type { EventHandler, PropValue } from '../html-to-vnode';

/**
 * 요소마다 "이벤트 표"를 둔다. 실제 리스너는 종류마다 한 번만 등록하고, 표에서 최신 함수를 찾아 호출한다.
 * 렌더링마다 새로 만들어지는 함수는 표의 값만 바꾸면 되므로 add/removeEventListener를 반복하지 않는다.
 * WeakMap이라 요소가 사라지면 표도 함께 정리되고, 요소 객체에 필드를 붙이지 않는다.
 */
interface EventTable {
  readonly handlers: Map<string, EventHandler>;
  readonly bound: Set<string>;
}

const tables = new WeakMap<Element, EventTable>();

/** 모든 요소·종류가 함께 쓰는 대리 함수. 표에 지금 들어 있는 함수를 호출한다. */
function dispatch(event: Event): void {
  const element = event.currentTarget as Element;
  tables.get(element)?.handlers.get(event.type)?.call(element, event);
}

/** on으로 시작하고 값이 함수인 props만 이벤트로 본다. */
export function isEventProp(name: string, value: PropValue | undefined): value is EventHandler {
  return typeof value === 'function' && isEventPropName(name);
}

/** 이름만 보고 판정한다. 삭제(remove)에는 값이 없으므로 이름으로 고른다. on* 속성 문자열은 입력 단계에서 이미 걸러진다. */
export function isEventPropName(name: string): boolean {
  return name.length > 2 && name.startsWith('on');
}

/** onClick → click, onKeyDown → keydown */
export function toEventType(name: string): string {
  return name.slice(2).toLowerCase();
}

/** 표의 함수를 교체한다. 그 종류의 대리 함수가 아직 없을 때만 addEventListener를 호출한다. */
export function setEvent(element: Element, type: string, handler: EventHandler): void {
  let table = tables.get(element);
  if (!table) {
    table = { handlers: new Map(), bound: new Set() };
    tables.set(element, table);
  }
  table.handlers.set(type, handler);
  if (!table.bound.has(type)) {
    element.addEventListener(type, dispatch);
    table.bound.add(type);
  }
}

/** 표에서만 지운다. 대리 함수는 남지만 호출할 함수가 없으므로 아무것도 하지 않는다. */
export function removeEvent(element: Element, type: string): void {
  tables.get(element)?.handlers.delete(type);
}

/** 지금 연결된 함수. 테스트와 디버그용. */
export function getEvent(element: Element, type: string): EventHandler | undefined {
  return tables.get(element)?.handlers.get(type);
}
