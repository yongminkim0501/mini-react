/**
 * 엔진 어댑터. 앱과 측정 도구는 이 모듈만 거쳐 엔진을 쓴다.
 * 같은 앱 팩터리를 stack과 세 Fiber 모드에 연결한다.
 *
 * - createEngine(mode): 'stack' | 'fiber-sync' | 'fiber-slice' | 'fiber'. 네 모드를 지원한다.
 * - startTransition(fn): 마지막으로 만든 엔진의 startTransition. stack은 fn()을 즉시 실행한다.
 * - 계측: engine.subscribe(listener)로 { type, root, label, t, patchCount? } 이벤트를 받는다.
 */
import {
  FunctionComponent,
  h,
  setInstrumentation,
  useEffect,
  useMemo,
  useState,
} from '../src/runtime/index.ts';
import { createFiberSyncEngine, createFiberSliceEngine, createFiberEngine } from '../src/fiber/index.ts';

export const ENGINE_MODES = /** @type {const} */ (['stack', 'fiber-sync', 'fiber-slice', 'fiber']);
/** 지금 구현된 모드. 러너는 나머지를 건너뛰고 결과에 skippedEngines로 남긴다. */
export const IMPLEMENTED_MODES = /** @type {const} */ (['stack', 'fiber-sync', 'fiber-slice', 'fiber']);

/** @param {string} mode */
export function isImplemented(mode) {
  return IMPLEMENTED_MODES.includes(/** @type {any} */ (mode));
}

/** @type {{ startTransition(fn: () => void): void } | null} */
let activeEngine = null;

/**
 * @param {string} mode
 */
export function createEngine(mode) {
  if (!ENGINE_MODES.includes(/** @type {any} */ (mode))) {
    throw new Error(`알 수 없는 엔진 모드: ${mode} (가능: ${ENGINE_MODES.join(', ')})`);
  }
  if (!isImplemented(mode)) throw new Error(`엔진 모드 '${mode}'는 아직 구현되지 않았습니다 (not implemented)`);
  const engine = mode === 'stack' ? createStackEngine() : mode === 'fiber-sync' ? createFiberSyncEngine() : mode === 'fiber-slice' ? createFiberSliceEngine() : createFiberEngine();
  activeEngine = engine;
  return engine;
}

/**
 * 낮은 우선순위 업데이트 표시. stack 엔진에는 우선순위가 없으므로 즉시 실행한다.
 * @param {() => void} fn
 */
export function startTransition(fn) {
  if (activeEngine) activeEngine.startTransition(fn);
  else fn();
}

function createStackEngine() {
  /** @type {WeakMap<object, string>} */
  const labels = new WeakMap();
  /** @type {Set<(event: any) => void>} */
  const listeners = new Set();

  const emit = (type, root, extra) => {
    if (listeners.size === 0) return;
    const event = { type, root, label: labels.get(root) ?? '?', t: performance.now(), ...extra };
    for (const listener of listeners) listener(event);
  };

  setInstrumentation({
    onRenderStart: (root) => emit('renderStart', root),
    onRenderEnd: (root, { ok }) => emit('renderEnd', root, { ok }),
    onCommit: ({ root, patchCount, mounted }) => emit('commit', root, { patchCount, mounted }),
  });

  return {
    mode: 'stack',
    h,
    useState,
    useEffect,
    useMemo,
    /** @param {() => void} fn */
    startTransition(fn) {
      fn();
    },
    /**
     * 루트 하나를 만든다.
     * @param {Function} component
     * @param {Element} container
     * @param {{ label: string, props?: object }} options
     */
    createRoot(component, container, { label, props }) {
      const instance = new FunctionComponent(/** @type {any} */ (component), container, props);
      labels.set(instance, label);
      return {
        label,
        instance,
        mount: () => instance.mount(),
        unmount: () => instance.unmount(),
      };
    },
    /**
     * 계측 이벤트 구독. 해제 함수를 돌려준다.
     * @param {(event: { type: 'renderStart'|'renderEnd'|'commit', label: string, t: number, patchCount?: number }) => void} listener
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
