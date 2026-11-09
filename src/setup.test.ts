import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('provides a DOM via jsdom', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p class="a">hi</p>';
    expect(div.querySelector('p')?.className).toBe('a');
  });
});
