import type { Child, Component, ElementProps, HNode } from '../runtime/types';
import type { Namespace } from '../core/vnode-to-dom/namespace';
import type { PropsDiff } from '../core/diff/types';

export type Action = unknown | ((previous: any) => unknown);
export interface StateQueue {
  pending: Action[];
  value: unknown;
  active: boolean;
  set: (action: Action) => void;
}
export interface EffectCell { cleanup: (() => void) | undefined }
export type Hook =
  | { kind: 'state'; value: unknown; queue: StateQueue; consumed: number }
  | { kind: 'memo'; value: unknown; deps: readonly unknown[] | undefined }
  | { kind: 'effect'; deps: readonly unknown[] | undefined; cell: EffectCell };
export interface PassiveEffect { cell: EffectCell; create: () => void | (() => void) }

/** Pure function components are transparent expansion frames, not identity boundaries. */
export interface Expansion {
  nodes: readonly HNode[];
  index: number;
  output: HNode[];
  outputDepths: number[];
  key: string | undefined;
  depth: number;
}
export const Placement = 1;
export const Update = 2;
export interface FiberNode {
  tag: 'root' | 'host' | 'text';
  type: string | Component<any> | null;
  key: string | undefined;
  pendingProps: ElementProps | string;
  memoizedProps: ElementProps | string;
  stateNode: Node | null;
  return: FiberNode | null;
  child: FiberNode | null;
  sibling: FiberNode | null;
  alternate: FiberNode | null;
  flags: number;
  deletions: FiberNode[];
  hooks: Hook[];
  namespace: Namespace;
  phase: 'begin' | 'expand' | 'children' | 'complete';
  input: readonly HNode[];
  expansion: Expansion[];
  resolved: readonly HNode[];
  resolvedDepths: readonly number[];
  componentDepth: number;
  index: number;
  oldChild: FiberNode | null;
  tail: FiberNode | null;
  propsDiff: PropsDiff | null;
}
export interface EngineEvent {
  type: 'renderStart' | 'renderEnd' | 'commit' | 'renderError' | 'renderSlice';
  root: object;
  label: string;
  t: number;
  attemptId: number;
  ok?: boolean;
  mounted?: boolean;
  patchCount?: number;
  /** Sum of work intervals excluding yielded time, not OS/thread CPU accounting. */
  activeMs?: number;
}
export interface RenderHost {
  component: (props: any) => Child;
  props: object;
  current: FiberNode | null;
  workInProgress: FiberNode | null;
  rendering: boolean;
  alive: boolean;
  effects: PassiveEffect[];
  placements: FiberNode[];
  updates: FiberNode[];
  deletions: FiberNode[];
  schedule(): boolean;
}
