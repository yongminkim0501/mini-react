import { h } from '../../../src/runtime';
import type { Todo } from '../types';
import { TodoItem } from './TodoItem';

interface Props {
  items: readonly Todo[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

export function TodoList({ items, onToggle, onRemove }: Props) {
  if (items.length === 0) return h('p', { class: 'empty' }, '할 일이 없습니다');
  return h(
    'ul',
    { class: 'todo-list' },
    items.map((item) => h(TodoItem, { key: item.id, item, onToggle, onRemove })),
  );
}
