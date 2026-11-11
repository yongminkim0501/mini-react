import { h } from '../../../src/runtime';

export function Footer({ doneCount, total }: { doneCount: number; total: number }) {
  return h('footer', { class: 'footer' }, '완료 ', doneCount, '개 / 전체 ', total, '개');
}
