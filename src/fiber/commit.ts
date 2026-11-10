import { updateProps } from './dom';
import { Placement } from './types';
import type { FiberNode, RenderHost } from './types';

function anchor(fiber: FiberNode): Node | null {
  for (let sibling = fiber.sibling; sibling; sibling = sibling.sibling) {
    if (!(sibling.flags & Placement)) return sibling.stateNode;
  }
  return null;
}

export function commitRoot(root: RenderHost) {
  const next = root.workInProgress!;
  for (const fiber of root.deletions) fiber.stateNode!.parentNode!.removeChild(fiber.stateNode!);
  for (const fiber of root.placements) fiber.return!.stateNode!.insertBefore(fiber.stateNode!, anchor(fiber));
  for (const fiber of root.updates) {
    if (fiber.tag === 'text') fiber.stateNode!.nodeValue = fiber.pendingProps as string;
    else updateProps(fiber.stateNode as Element, fiber.propsDiff!);
  }
  for (const hook of next.hooks) {
    if (hook.kind === 'state') {
      if (root.laneAware) hook.queue.updates.splice(0, hook.consumed);
      else hook.queue.pending.splice(0, hook.consumed);
      hook.queue.value = hook.value;
      hook.queue.active = true;
      hook.queue.hasBase = hook.baseQueue.length > 0;
    }
  }
  root.current = next;
  root.workInProgress = null;
}
