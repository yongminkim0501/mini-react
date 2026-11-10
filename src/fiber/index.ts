import { h } from '../runtime/h';
import { useEffect, useMemo, useState } from './hooks';
import { FiberRoot } from './root';
import type { Child } from '../runtime/types';
import type { EngineEvent } from './types';
import { SliceScheduler } from './scheduler';
import { runWithLane, TransitionLane } from './lanes';

export { h, useEffect, useMemo, useState, FiberRoot };

/** Same reconciliation and commit path, only the host scheduling policy changes. */
export function createFiberSyncEngine() {
  return createEngine('fiber-sync');
}
export function createFiberSliceEngine(scheduler = new SliceScheduler()) {
  return createEngine('fiber-slice', scheduler);
}
export function createFiberEngine(scheduler = new SliceScheduler(undefined, undefined, true)) {
  return createEngine('fiber', scheduler);
}
function createEngine(mode: 'fiber-sync' | 'fiber-slice' | 'fiber', scheduler?: SliceScheduler) {
  const listeners = new Set<(event: EngineEvent) => void>();
  return {
    mode, h, useEffect, useMemo, useState,
    startTransition(fn: () => void) { if (mode === 'fiber') runWithLane(TransitionLane, fn); else fn(); },
    createRoot(component: (props: any) => Child, container: Element, { label, props = {} }: { label: string; props?: object }) {
      const root = new FiberRoot(component, container, label, Object.freeze({ ...props, children: [] }),
        (event) => { for (const listener of listeners) listener(event); }, scheduler, mode === 'fiber');
      return { label, instance: root, mount: () => root.mount(), unmount: () => root.unmount() };
    },
    subscribe(listener: (event: EngineEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() { scheduler?.dispose(); listeners.clear(); },
  };
}
