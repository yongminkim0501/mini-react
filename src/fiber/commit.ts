import { count } from './counters';
import { updateProps } from './dom';
import { Placement } from './types';
import type { FiberNode, RenderHost } from './types';

function anchor(root: RenderHost, fiber: FiberNode): Node | null {
  for (let sibling = fiber.sibling; sibling; sibling = sibling.sibling) {
    count(root, sibling.insideHeatmap, 'commitAnchorSiblingVisits');
    count(root, sibling.insideHeatmap, 'commitFiberVisits');
    if (!(sibling.flags & Placement)) return sibling.stateNode;
  }
  return null;
}

export function commitRoot(root: RenderHost) {
  const next = root.workInProgress!;
  const visit = (fiber: FiberNode) => { count(root, fiber.insideHeatmap, 'commitEffectVisits'); count(root, fiber.insideHeatmap, 'commitFiberVisits'); };
  for (const fiber of root.deletions) {
    visit(fiber); fiber.stateNode!.parentNode!.removeChild(fiber.stateNode!);
    count(root, fiber.insideHeatmap, 'liveDomWrites');
  }
  for (const fiber of root.placements) {
    visit(fiber); fiber.return!.stateNode!.insertBefore(fiber.stateNode!, anchor(root, fiber));
    count(root, fiber.insideHeatmap, 'liveDomWrites');
  }
  for (const fiber of root.updates) {
    visit(fiber);
    if (fiber.tag === 'text') { fiber.stateNode!.nodeValue = fiber.pendingProps as string; count(root, fiber.insideHeatmap, 'liveDomWrites'); }
    else updateProps(fiber.stateNode as Element, fiber.propsDiff!, key => count(root, fiber.insideHeatmap, key));
  }
  for (const hook of next.hooks) {
    count(root, false, 'commitHookVisits');
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
