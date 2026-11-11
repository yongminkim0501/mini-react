import { h } from '../../../src/runtime';

interface Props {
  value: string;
  onInput: (event: Event) => void;
  onAdd: () => void;
}

export function TodoInput({ value, onInput, onAdd }: Props) {
  // 한글 조합 중 Enter는 글자 확정용이므로 추가하지 않는다.
  const onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.key === 'Enter' && !key.isComposing) onAdd();
  };
  return h(
    'div',
    { class: 'todo-input' },
    h('input', {
      type: 'text',
      placeholder: '할 일을 입력하세요',
      'aria-label': '할 일',
      value,
      onInput,
      onKeyDown,
    }),
    h('button', { type: 'button', class: 'add', onClick: onAdd }, '추가'),
  );
}
