/** useState 칸. setState는 첫 렌더링에서 한 번만 만든다. */
export interface StateSlot {
  readonly kind: 'state';
  value: unknown;
  readonly setState: (next: unknown) => void;
}

/** useEffect 칸. deps와 cleanup은 effect를 실행할 때 저장한다. */
export interface EffectSlot {
  readonly kind: 'effect';
  deps: readonly unknown[] | undefined;
  cleanup: (() => void) | undefined;
}

/** useMemo 칸. */
export interface MemoSlot {
  readonly kind: 'memo';
  deps: readonly unknown[] | undefined;
  value: unknown;
}

export type HookSlot = StateSlot | EffectSlot | MemoSlot;
export type HookKind = HookSlot['kind'];

export type EffectCallback = () => void | (() => void);

/** 렌더링 중 예약하고 반영 후 실행할 effect. */
export interface PendingEffect {
  readonly index: number;
  readonly fn: EffectCallback;
  readonly deps: readonly unknown[] | undefined;
}

/** Hook이 읽고 쓰는 컴포넌트 쪽 상태. FunctionComponent가 구현한다. */
export interface HookHost {
  readonly hooks: HookSlot[];
  pendingEffects: PendingEffect[];
  readonly isMounted: boolean;
  readonly isRendering: boolean;
  update(): void;
}

interface RenderFrame {
  readonly component: HookHost | null;
  readonly hookIndex: number;
  readonly isRenderingChild: boolean;
}

/**
 * JS는 한 번에 한 함수만 실행하고 렌더링은 중간에 끊기지 않으므로 전역 변수로 충분하다.
 * 렌더링 안에서 다른 인스턴스를 렌더링해도 섞이지 않도록 시작할 때 이전 값을 쌓아 두고 끝나면 되돌린다.
 */
let currentComponent: HookHost | null = null;
let hookIndex = 0;
/** 자식 컴포넌트 실행 중 여부. resolve가 켜고 끈다. 켜져 있으면 Hook 호출은 오류다. */
let isRenderingChild = false;
const frames: RenderFrame[] = [];

/** 렌더링 시작. 현재 컴포넌트를 바꾸고 칸 번호를 0으로 되돌린다. */
export function beginRender(component: HookHost): void {
  frames.push({ component: currentComponent, hookIndex, isRenderingChild });
  currentComponent = component;
  hookIndex = 0;
  isRenderingChild = false;
}

/** 렌더링 종료. 이전 값으로 되돌리고 이번 렌더링의 Hook 호출 개수를 돌려준다. 오류가 나도 finally에서 호출한다. */
export function endRender(): number {
  const count = hookIndex;
  const frame = frames.pop();
  currentComponent = frame?.component ?? null;
  hookIndex = frame?.hookIndex ?? 0;
  isRenderingChild = frame?.isRenderingChild ?? false;
  return count;
}

/** 지금 렌더링 중인 루트 컴포넌트. 없으면 null. */
export function getCurrentComponent(): HookHost | null {
  return currentComponent;
}

/** 자식 실행 중 표시를 바꾸고 이전 값을 돌려준다. 중첩 자식에서도 끝나면 이전 값으로 되돌린다. */
export function setRenderingChild(value: boolean): boolean {
  const previous = isRenderingChild;
  isRenderingChild = value;
  return previous;
}

export const HOOK_OUTSIDE_RENDER = 'Hook은 컴포넌트 렌더링 중에만 호출할 수 있습니다';
export const HOOK_IN_CHILD = 'Hook은 루트 컴포넌트에서만 사용할 수 있습니다';

export interface SlotHandle<K extends HookKind> {
  readonly component: HookHost;
  readonly index: number;
  /** 첫 렌더링이면 undefined. 각 Hook이 칸을 만들어 component.hooks[index]에 넣는다. */
  readonly slot: Extract<HookSlot, { kind: K }> | undefined;
}

/**
 * Hook이 자기 칸을 받는다. Hook은 이름이 아니라 호출 순서로 칸을 찾으므로
 * 매 렌더링 같은 순서·같은 개수로 불러야 한다. 칸 종류가 다르면 순서가 바뀐 것이다.
 */
export function useHookSlot<K extends HookKind>(kind: K): SlotHandle<K> {
  if (!currentComponent) throw new Error(HOOK_OUTSIDE_RENDER);
  if (isRenderingChild) throw new Error(HOOK_IN_CHILD);

  const index = hookIndex++;
  const slot = currentComponent.hooks[index];
  if (slot && slot.kind !== kind) {
    throw new Error(`Hook 호출 순서가 바뀌었습니다: ${index}번 칸은 ${slot.kind}인데 ${kind}로 호출했습니다`);
  }
  return { component: currentComponent, index, slot: slot as Extract<HookSlot, { kind: K }> | undefined };
}

/**
 * useEffect, useMemo가 함께 쓰는 의존성 비교.
 * next가 없으면 매번 바뀐 것으로 본다. NaN도 같게 보도록 ===가 아니라 Object.is로 비교한다.
 */
export function depsChanged(prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined): boolean {
  if (next === undefined || prev === undefined) return true;
  if (prev.length !== next.length) return true;
  return next.some((value, i) => !Object.is(value, prev[i]));
}
