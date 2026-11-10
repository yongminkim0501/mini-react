import { h } from '../runtime/h';
import { useEffect, useMemo, useState } from './hooks';
import { FiberRoot } from './root';
import type { Child } from '../runtime/types';
import type { EngineEvent } from './types';

export { h, useEffect, useMemo, useState, FiberRoot };

/** B-1 only: no time slicing, lane selection, or subtree bailout. */
export function createFiberSyncEngine() {
  const listeners = new Set<(event: EngineEvent) => void>();
  return {
    mode: 'fiber-sync', h, useEffect, useMemo, useState,
    startTransition(fn: () => void) { fn(); },
    createRoot(component: (props: any) => Child, container: Element, { label, props = {} }: { label: string; props?: object }) {
      const root = new FiberRoot(component, container, label, Object.freeze({ ...props, children: [] }),
        (event) => { for (const listener of listeners) listener(event); });
      return { label, instance: root, mount: () => root.mount(), unmount: () => root.unmount() };
    },
    subscribe(listener: (event: EngineEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
