import { h } from '../../../src/runtime';
import type { Filter } from '../types';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '진행 중' },
  { value: 'done', label: '완료' },
];

interface Props {
  filter: Filter;
  onChange: (filter: Filter) => void;
}

export function FilterBar({ filter, onChange }: Props) {
  return h(
    'div',
    { class: 'filters', role: 'group', 'aria-label': '필터' },
    FILTERS.map(({ value, label }) =>
      h(
        'button',
        {
          type: 'button',
          class: value === filter ? 'filter active' : 'filter',
          'aria-pressed': value === filter ? 'true' : 'false',
          onClick: () => onChange(value),
        },
        label,
      ),
    ),
  );
}
