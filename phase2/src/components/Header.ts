import { h } from '../../../src/runtime';

export function Header({ remaining }: { remaining: number }) {
  return h('header', { class: 'header' }, h('h1', null, '할 일 (남은 일 ', remaining, '개)'));
}
