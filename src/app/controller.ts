import { diff } from '../core/diff';
import type { Patch } from '../core/diff';
import { fromDom, fromHtml } from '../core/html-to-vnode';
import type { ConvertWarning, VElement } from '../core/html-to-vnode';
import { applyPatches } from '../core/patch';
import { mount } from '../core/vnode-to-dom';
import { serialize } from '../core/vnode-to-html';
import { StateHistory } from '../state/history';
import { highlight, showPatchLog } from './log';
import { showStatus, updateControls } from './view';
import type { StatusMessage, View } from './view';

export interface ControllerOptions {
  /** 수정 중 이동 확인 창. 테스트에서 바꿔 끼운다. 기본은 window.confirm. */
  readonly confirm?: (message: string) => boolean;
}

export interface Controller {
  readonly history: StateHistory<VElement>;
  onPatch(): void;
  onBack(): void;
  onForward(): void;
  isDirty(): boolean;
}

export const DIRTY_CONFIRM = '테스트 영역에서 Patch하지 않은 수정 내용이 사라집니다. 이동할까요?';
export const NO_CHANGES = '변경 사항 없음';
export const REMOUNTED = '변경 부분만 반영하지 못해 실제 영역 전체를 다시 그렸습니다.';

/** 경고 한 건을 상태 영역 문장으로 바꾼다. */
export function describeWarning(warning: ConvertWarning): StatusMessage {
  switch (warning.code) {
    case 'INPUT_TOO_LARGE':
      return { kind: 'error', text: `입력이 너무 큽니다 (${warning.detail})` };
    case 'SANITIZED_ELEMENT':
    case 'SANITIZED_ATTR':
      return { kind: warning.severity, text: `${warning.detail}됨` };
    case 'DUPLICATE_KEY':
      return { kind: warning.severity, text: warning.detail };
  }
}

/** 페이지 로드 흐름(5.1)을 실행하고 버튼 이벤트를 등록한다. */
export function init(view: View, options: ControllerOptions = {}): Controller {
  const win = view.real.ownerDocument.defaultView;
  const confirm = options.confirm ?? ((message: string) => win?.confirm(message) ?? true);
  const history = new StateHistory<VElement>();

  // 5.1: 실제 영역을 읽고, 정규화 마운트로 공백·주석을 걷어 DOM과 VNode를 1:1로 맞춘다.
  const v0 = fromDom(view.real).vnode;
  mount(view.real, v0);
  view.test.value = serialize(v0);
  history.push(v0);
  refresh();

  function refresh(): void {
    updateControls(view, history);
  }

  function isDirty(): boolean {
    const current = history.current;
    return current !== null && view.test.value !== serialize(current);
  }

  /**
   * 실제 영역을 from에서 to로 바꾼다. 변경 부분만 반영하고,
   * 대상을 못 찾거나 반영 중 예외가 나면 to로 다시 그려 DOM·VNode 일치를 되돌린다.
   */
  function render(patches: readonly Patch[], to: VElement): { remounted: boolean } {
    let changed: readonly Element[] = [];
    let ok = false;
    try {
      ({ ok, changed } = applyPatches(view.real, patches));
    } catch {
      ok = false;
    }
    if (!ok) {
      mount(view.real, to);
      return { remounted: true };
    }
    highlight(changed);
    return { remounted: false };
  }

  /** 5.2 Patch 흐름. */
  function onPatch(): void {
    const from = history.current;
    if (!from) return;

    const result = fromHtml(view.test.value);
    const messages = result.warnings.map(describeWarning);
    if (!result.ok) {
      showStatus(view, messages);
      showPatchLog(view, []);
      return;
    }

    const patches = diff(from, result.vnode);
    if (patches.length === 0) {
      // 같은 트리면 정리된 코드로만 맞춰 둔다. 공백만 바꾼 경우 이동 시 확인 창이 뜨지 않게 한다.
      view.test.value = serialize(from);
      showStatus(view, [...messages, { kind: 'info', text: NO_CHANGES }]);
      showPatchLog(view, []);
      return;
    }

    const { remounted } = render(patches, result.vnode);
    history.push(result.vnode);
    // 브라우저가 실제로 해석한 결과(제거된 속성, 파서 보정)를 바로 보여준다.
    view.test.value = serialize(result.vnode);
    showStatus(view, remounted ? [...messages, { kind: 'warn', text: REMOUNTED }] : messages);
    showPatchLog(view, patches);
    refresh();
  }

  /** 5.3 뒤로가기 / 앞으로가기 공통 흐름. */
  function moveTo(direction: 'back' | 'forward'): void {
    const possible = direction === 'back' ? history.canBack : history.canForward;
    if (!possible) return;
    if (isDirty() && !confirm(DIRTY_CONFIRM)) return;

    const from = history.current;
    const to = direction === 'back' ? history.back() : history.forward();
    if (!from || !to) return;

    // 이동도 두 VNode 사이의 변화이므로 diff와 applyPatches를 그대로 쓴다 (5.4).
    const patches = diff(from, to);
    const { remounted } = render(patches, to);
    view.test.value = serialize(to);
    showStatus(view, remounted ? [{ kind: 'warn', text: REMOUNTED }] : []);
    showPatchLog(view, patches);
    refresh();
  }

  const onBack = () => moveTo('back');
  const onForward = () => moveTo('forward');

  view.patch.addEventListener('click', onPatch);
  view.back.addEventListener('click', onBack);
  view.forward.addEventListener('click', onForward);

  return { history, onPatch, onBack, onForward, isDirty };
}
