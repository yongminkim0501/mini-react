import { h } from '../../../src/runtime';
import type { Todo } from '../types';

export interface TodoItemProps {
  item: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

/** 상태 없음. props만 읽고, 바꿀 때는 props로 받은 함수만 부른다. */
export function TodoItem({ item, onToggle, onRemove }: TodoItemProps) {
  return h(
    'li',
    { class: item.done ? 'todo done' : 'todo' },
    h(
      'label',
      null,
      h('input', { type: 'checkbox', checked: item.done, onChange: () => onToggle(item.id) }),
      h('span', null, item.text),
    ),
    h('button', { type: 'button', class: 'remove', 'aria-label': `${item.text} 삭제`, onClick: () => onRemove(item.id) }, '삭제'),
  );
}
