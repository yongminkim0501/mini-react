export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

export type Filter = 'all' | 'active' | 'done';

export interface Counts {
  readonly remaining: number;
  readonly done: number;
  readonly total: number;
}
