import type { VNode } from '../html-to-vnode';

/** #root로부터의 자식 인덱스 배열. 항상 이전 트리 기준이다. */
export type Path = readonly number[];

export interface CreatePatch {
  readonly type: 'CREATE';
  readonly parentPath: Path;
  readonly index: number;
  readonly node: VNode;
}

export interface RemovePatch {
  readonly type: 'REMOVE';
  readonly path: Path;
}

export interface ReplacePatch {
  readonly type: 'REPLACE';
  readonly path: Path;
  readonly node: VNode;
}

export interface TextPatch {
  readonly type: 'TEXT';
  readonly path: Path;
  readonly text: string;
}

export interface PropsPatch {
  readonly type: 'PROPS';
  readonly path: Path;
  readonly set: Readonly<Record<string, string>>;
  readonly remove: readonly string[];
}

export type Patch = CreatePatch | RemovePatch | ReplacePatch | TextPatch | PropsPatch;

export interface PropsDiff {
  readonly set: Readonly<Record<string, string>>;
  readonly remove: readonly string[];
}
