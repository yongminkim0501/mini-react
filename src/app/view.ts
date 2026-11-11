import type { HistoryPosition } from '../state/history';

/** 검증 페이지에서 쓰는 화면 요소 참조. */
export interface View {
  readonly real: HTMLElement;
  readonly test: HTMLTextAreaElement;
  readonly back: HTMLButtonElement;
  readonly patch: HTMLButtonElement;
  readonly forward: HTMLButtonElement;
  readonly position: HTMLElement;
  readonly status: HTMLElement;
  readonly log: HTMLOListElement;
  readonly count: HTMLElement;
}

export type StatusKind = 'info' | 'warn' | 'error';

export interface StatusMessage {
  readonly kind: StatusKind;
  readonly text: string;
}

export interface ControlState {
  readonly canBack: boolean;
  readonly canForward: boolean;
  readonly position: HistoryPosition;
}

function pick<T extends HTMLElement>(root: ParentNode, id: string, type: { new (): T }): T {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof type)) throw new Error(`#${id} 요소가 없거나 종류가 다릅니다`);
  return element;
}

/** 3.1 요소 목록의 id로 화면 요소를 찾는다. 하나라도 없으면 예외. */
export function getView(root: Document = document): View {
  const win = root.defaultView ?? window;
  return {
    real: pick(root, 'real-area', win.HTMLElement),
    test: pick(root, 'test-area', win.HTMLTextAreaElement),
    back: pick(root, 'btn-back', win.HTMLButtonElement),
    patch: pick(root, 'btn-patch', win.HTMLButtonElement),
    forward: pick(root, 'btn-forward', win.HTMLButtonElement),
    position: pick(root, 'history-pos', win.HTMLElement),
    status: pick(root, 'status', win.HTMLElement),
    log: pick(root, 'patch-log', win.HTMLOListElement),
    count: pick(root, 'patch-count', win.HTMLElement),
  };
}

/** 5.5 버튼 활성화와 위치 표시를 갱신한다. */
export function updateControls(view: View, state: ControlState): void {
  view.back.disabled = !state.canBack;
  view.forward.disabled = !state.canForward;
  view.position.textContent = `${state.position.index} / ${state.position.total}`;
}

/** 상태 영역을 주어진 메시지로 교체한다. 빈 배열이면 비운다. */
export function showStatus(view: View, messages: readonly StatusMessage[]): void {
  const doc = view.status.ownerDocument;
  view.status.replaceChildren(
    ...messages.map(({ kind, text }) => {
      const p = doc.createElement('p');
      p.className = kind;
      p.textContent = text;
      return p;
    }),
  );
}
