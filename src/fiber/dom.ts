import { syncFormProp } from '../core/patch/formProps';
import { HTML_NAMESPACE } from '../core/vnode-to-dom/namespace';
import type { Namespace } from '../core/vnode-to-dom/namespace';
import type { PropsDiff } from '../core/diff/types';
import type { EventHandler, PropValue } from '../runtime/types';

const events = new WeakMap<Element, Map<string, EventHandler | undefined>>();
function setEvent(element: Element, name: string, handler: EventHandler | undefined) {
  let table = events.get(element);
  if (!table) events.set(element, table = new Map());
  const type = name.slice(2).toLowerCase();
  if (!table.has(type)) {
    element.addEventListener(type, (event) => table!.get(type)?.call(element, event));
  }
  table.set(type, handler);
}

function setProp(element: Element, name: string, value: PropValue | null, initial: boolean) {
  if (name.length > 2 && name.startsWith('on')) {
    setEvent(element, name, typeof value === 'function' ? value : undefined);
  } else if (value === null) {
    element.removeAttribute(name);
    syncFormProp(element, name, null);
  } else if (typeof value === 'string') {
    element.setAttribute(name, value);
    // Match stack: initial attributes vs updates to dirty form properties.
    if (!initial) syncFormProp(element, name, value);
  }
}

export function createHost(type: string, namespace: Namespace, props: Readonly<Record<string, PropValue>>) {
  const node = namespace === HTML_NAMESPACE ? document.createElement(type) : document.createElementNS(namespace, type);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value, true);
  return node;
}

export function updateProps(node: Element, diff: PropsDiff) {
  for (const [name, value] of Object.entries(diff.set)) setProp(node, name, value, false);
  for (const name of diff.remove) setProp(node, name, null, false);
}
