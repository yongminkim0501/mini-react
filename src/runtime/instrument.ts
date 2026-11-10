/**
 * 측정 도구용 계측 지점. 등록하지 않으면 아무 일도 하지 않는다.
 * 엔진 동작에는 영향을 주지 않도록 훅에서 난 오류는 삼킨다.
 */
export interface Instrumentation {
  /** 렌더링(컴포넌트 실행 + resolve) 시작 */
  onRenderStart?(root: object): void;
  /** 렌더링 끝. 실패해도 호출한다. */
  onRenderEnd?(root: object, info: { readonly ok: boolean }): void;
  /** DOM 반영 직후, effect 실행 전. mount는 mounted: true, patchCount 0. */
  onCommit?(info: { readonly root: object; readonly patchCount: number; readonly mounted: boolean }): void;
}

let current: Instrumentation | null = null;

/** 계측 훅을 등록한다. null이면 해제한다. 한 번에 하나만 등록된다. */
export function setInstrumentation(next: Instrumentation | null): void {
  current = next;
}

export function emitRenderStart(root: object): void {
  if (!current?.onRenderStart) return;
  try {
    current.onRenderStart(root);
  } catch {
    // 계측 오류는 엔진에 영향을 주지 않는다.
  }
}

export function emitRenderEnd(root: object, ok: boolean): void {
  if (!current?.onRenderEnd) return;
  try {
    current.onRenderEnd(root, { ok });
  } catch {
    // 계측 오류는 엔진에 영향을 주지 않는다.
  }
}

export function emitCommit(root: object, patchCount: number, mounted: boolean): void {
  if (!current?.onCommit) return;
  try {
    current.onCommit({ root, patchCount, mounted });
  } catch {
    // 계측 오류는 엔진에 영향을 주지 않는다.
  }
}
