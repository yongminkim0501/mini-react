import type { CounterKey } from './counters';
import { syncFormProp } from '../core/patch/formProps';
import { HTML_NAMESPACE } from '../core/vnode-to-dom/namespace';
import type { Namespace } from '../core/vnode-to-dom/namespace';
import type { PropsDiff } from '../core/diff/types';
import type { EventHandler, PropValue } from '../runtime/types';
import { runWithLane, SyncLane } from './lanes';

const events = new WeakMap<Element, Map<string, EventHandler | undefined>>();
function setEvent(element: Element, name: string, handler: EventHandler | undefined) {
  let table = events.get(element);
  if (!table) events.set(element, table = new Map());
  const type = name.slice(2).toLowerCase();
  if (!table.has(type)) {
    element.addEventListener(type, (event) => runWithLane(SyncLane, () => table!.get(type)?.call(element, event)));
  }
  table.set(type, handler);
}

function setProp(element: Element, name: string, value: PropValue | null, initial: boolean, count?: (key: CounterKey) => void) {
  if (name.length > 2 && name.startsWith('on')) {
    count?.('eventHandlerWrites');
    setEvent(element, name, typeof value === 'function' ? value : undefined);
  } else if (value === null) {
    count?.(initial ? 'detachedDomOps' : 'liveDomWrites');
    element.removeAttribute(name);
    formProp(element, name, null, count);
  } else if (typeof value === 'string') {
    count?.(initial ? 'detachedDomOps' : 'liveDomWrites');
    element.setAttribute(name, value);
    // Match stack: initial attributes vs updates to dirty form properties.
    if (!initial) formProp(element, name, value, count);
  }
}

function formProp(element: Element, name: string, value: string | null, count?: (key: CounterKey) => void) {
  if ((name === 'value' && element instanceof HTMLInputElement && element.type !== 'file' && element.value !== (value ?? '')) ||
      (name === 'checked' && element instanceof HTMLInputElement) || (name === 'selected' && element instanceof HTMLOptionElement)) count?.('liveDomWrites');
  syncFormProp(element, name, value);
}
export function createHost(type: string, namespace: Namespace, props: Readonly<Record<string, PropValue>>, count?: (key: CounterKey) => void) {
  count?.('detachedDomOps');
  const node = namespace === HTML_NAMESPACE ? document.createElement(type) : document.createElementNS(namespace, type);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value, true, count);
  return node;
}

export function updateProps(node: Element, diff: PropsDiff, count?: (key: CounterKey) => void) {
  for (const [name, value] of Object.entries(diff.set)) setProp(node, name, value, false, count);
  for (const name of diff.remove) setProp(node, name, null, false, count);
}
