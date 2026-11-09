import { formatPatch } from '../../src/app/log';
import type { Patch, PropsPatch } from '../../src/core/diff';
import type { PropValue } from '../../src/core/html-to-vnode';
import type { FunctionComponent, HookSlot } from '../../src/runtime';

/** 이벤트 교체만 있는 PROPS는 묶어서 건수로, 섞여 있으면 이벤트를 뺀 나머지만 보여준다. */
export function splitEventPatches(patches: readonly Patch[]): { shown: Patch[]; eventSwaps: number } {
  const shown: Patch[] = [];
  let eventSwaps = 0;
  for (const patch of patches) {
    if (patch.type !== 'PROPS') {
      shown.push(patch);
      continue;
    }
    const set: Record<string, PropValue> = {};
    for (const [name, value] of Object.entries(patch.set)) {
      if (typeof value === 'function') eventSwaps++;
      else set[name] = value;
    }
    const remove = patch.remove.filter((name) => {
      const isEvent = name.startsWith('on');
      if (isEvent) eventSwaps++;
      return !isEvent;
    });
    if (Object.keys(set).length > 0 || remove.length > 0) {
      const rest: PropsPatch = { type: 'PROPS', path: patch.path, set, remove };
      shown.push(rest);
    }
  }
  return { shown, eventSwaps };
}

/** 값을 한 줄로 줄인다. 함수는 ƒ. */
export function summarize(value: unknown, max = 90): string {
  let text: string;
  try {
    text = JSON.stringify(value, (_key, v: unknown) => (typeof v === 'function' ? 'ƒ' : v)) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 칸 한 줄. 이전 커밋과 비교해 memo는 재계산, effect는 실행 여부를 표시한다. */
export function describeSlot(slot: HookSlot, previous: HookSlot | undefined): string {
  switch (slot.kind) {
    case 'state':
      return `state = ${summarize(slot.value)}`;
    case 'memo': {
      const recomputed = previous?.kind === 'memo' && previous.deps !== slot.deps;
      return `memo deps ${summarize(slot.deps)} → ${summarize(slot.value, 60)}${recomputed ? '  ⟳ 재계산' : ''}`;
    }
    case 'effect': {
      const ran = previous?.kind === 'effect' && previous.deps !== slot.deps;
      return `effect deps ${summarize(slot.deps)}${ran ? '  ▶ 실행' : ''}`;
    }
  }
}

interface Snapshot {
  readonly kind: HookSlot['kind'];
  readonly deps: unknown;
}

/**
 * 앱 바깥의 디버그 패널. FunctionComponent의 onCommit으로 갱신한다.
 * onCommit은 effect 실행 전에 불리므로, effect가 저장한 deps까지 보이도록 마이크로태스크로 미뤄 그린다.
 */
export function createDebugPanel(root: Element, app: FunctionComponent<any>, labels: readonly string[]) {
  const doc = root.ownerDocument;
  const renders = doc.createElement('p');
  renders.className = 'debug-renders';
  const hooksTitle = doc.createElement('h3');
  hooksTitle.textContent = 'hooks';
  const hooks = doc.createElement('ol');
  hooks.className = 'debug-hooks';
  hooks.start = 0;
  const patchTitle = doc.createElement('h3');
  patchTitle.textContent = '마지막 Patch';
  const patchList = doc.createElement('ol');
  patchList.className = 'debug-patches';
  const summary = doc.createElement('p');
  summary.className = 'debug-summary';
  root.replaceChildren(renders, hooksTitle, hooks, patchTitle, patchList, summary);

  let count = 0;
  let previous: Snapshot[] = [];

  const render = (patches: readonly Patch[]) => {
    renders.textContent = `렌더링 ${count}회 · hooks ${app.hooks.length}칸`;

    hooks.replaceChildren(
      ...app.hooks.map((slot, i) => {
        const li = doc.createElement('li');
        const before = previous[i];
        const prevSlot = before ? ({ kind: before.kind, deps: before.deps } as HookSlot) : undefined;
        li.textContent = `${labels[i] ?? `#${i}`}: ${describeSlot(slot, count > 1 ? prevSlot : undefined)}`;
        return li;
      }),
    );
    previous = app.hooks.map((slot) => ({ kind: slot.kind, deps: slot.kind === 'state' ? undefined : slot.deps }));

    const { shown, eventSwaps } = splitEventPatches(patches);
    patchList.replaceChildren(
      ...shown.map((patch) => {
        const li = doc.createElement('li');
        li.textContent = formatPatch(patch);
        return li;
      }),
    );
    const parts = [count === 1 ? 'mount (전체 그리기)' : `Patch ${shown.length}건`];
    if (eventSwaps > 0) parts.push(`이벤트 교체 ${eventSwaps}건`);
    summary.textContent = parts.join(' · ');
  };

  return {
    record(patches: readonly Patch[]): void {
      count++;
      queueMicrotask(() => render(patches));
    },
    get count() {
      return count;
    },
  };
}
