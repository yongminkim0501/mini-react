import { describe, expect, it } from 'vitest';
import { fromHtml } from '../core/html-to-vnode';
import type { VElement } from '../core/html-to-vnode';
import { StateHistory } from './history';

function snap(html: string): VElement {
  return fromHtml(html).vnode;
}

describe('StateHistory 기획서 7장 순서', () => {
  it('각 단계의 반환값과 상태가 표와 일치한다', () => {
    const [v0, v1, v2, v3] = ['<p>0</p>', '<p>1</p>', '<p>2</p>', '<p>3</p>'].map(snap) as [
      VElement,
      VElement,
      VElement,
      VElement,
    ];
    const h = new StateHistory<VElement>();

    type Step = {
      run: () => VElement | null | void;
      ret?: VElement | null;
      current: VElement;
      pos: [number, number];
      back: boolean;
      fwd: boolean;
    };
    const steps: Step[] = [
      { run: () => h.push(v0), current: v0, pos: [1, 1], back: false, fwd: false },
      { run: () => h.push(v1), current: v1, pos: [2, 2], back: true, fwd: false },
      { run: () => h.push(v2), current: v2, pos: [3, 3], back: true, fwd: false },
      { run: () => h.back(), ret: v1, current: v1, pos: [2, 3], back: true, fwd: true },
      { run: () => h.back(), ret: v0, current: v0, pos: [1, 3], back: false, fwd: true },
      { run: () => h.back(), ret: null, current: v0, pos: [1, 3], back: false, fwd: true },
      { run: () => h.forward(), ret: v1, current: v1, pos: [2, 3], back: true, fwd: true },
      { run: () => h.push(v3), current: v3, pos: [3, 3], back: true, fwd: false },
      { run: () => h.forward(), ret: null, current: v3, pos: [3, 3], back: true, fwd: false },
    ];

    steps.forEach((s, i) => {
      const ret = s.run();
      const label = `${i + 1}번`;
      if ('ret' in s) expect(ret, label).toBe(s.ret);
      expect(h.current, label).toBe(s.current);
      expect(h.position, label).toEqual({ index: s.pos[0], total: s.pos[1] });
      expect(h.canBack, label).toBe(s.back);
      expect(h.canForward, label).toBe(s.fwd);
    });

    // 8번에서 v2가 버려졌으므로 뒤로 가면 v1, v0만 남아 있다.
    expect(h.back()).toBe(v1);
    expect(h.back()).toBe(v0);
    expect(h.back()).toBeNull();
  });
});

describe('StateHistory 경계', () => {
  it('빈 기록: current는 null, back/forward도 null이고 오류가 없다', () => {
    const h = new StateHistory<VElement>();
    expect(h.current).toBeNull();
    expect(h.back()).toBeNull();
    expect(h.forward()).toBeNull();
    expect(h.canBack).toBe(false);
    expect(h.canForward).toBe(false);
    expect(h.position).toEqual({ index: 0, total: 0 });
  });

  it('back()으로 받은 VNode는 push한 객체와 같다', () => {
    const v0 = snap('<div>a</div>');
    const v1 = snap('<div>b</div>');
    const h = new StateHistory<VElement>();
    h.push(v0);
    h.push(v1);
    expect(h.back()).toBe(v0);
    expect(h.forward()).toBe(v1);
  });

  it('저장된 VNode는 동결되어 수정되지 않고 기록 내용이 유지된다', () => {
    const v0 = snap('<p class="a">hello</p>');
    const before = JSON.stringify(v0);
    const h = new StateHistory<VElement>();
    h.push(v0);

    const p = v0.children[0] as VElement;
    expect(() => {
      (p.props as Record<string, string>).class = 'b';
    }).toThrow(TypeError);
    expect(() => {
      (p.children as unknown[]).push({ kind: 'text', text: 'x' });
    }).toThrow(TypeError);

    expect(JSON.stringify(h.current)).toBe(before);
  });

  it('push 100회 후 back 99회면 current가 최초 VNode다', () => {
    const h = new StateHistory<VElement>();
    const all = Array.from({ length: 100 }, (_, i) => snap(`<p>${i}</p>`));
    all.forEach((v) => h.push(v));
    for (let i = 0; i < 99; i++) expect(h.back()).toBe(all[98 - i]);
    expect(h.current).toBe(all[0]);
    expect(h.canBack).toBe(false);
    expect(h.position).toEqual({ index: 1, total: 100 });
  });

  it('중간에서 push하면 미래 기록이 여러 개라도 모두 버려진다', () => {
    const h = new StateHistory<VElement>();
    const [v0, v1, v2, v3, v4] = [0, 1, 2, 3, 4].map((i) => snap(`<p>${i}</p>`));
    [v0, v1, v2, v3].forEach((v) => h.push(v!));
    h.back();
    h.back();
    h.push(v4!);
    expect(h.position).toEqual({ index: 3, total: 3 });
    expect(h.canForward).toBe(false);
    expect(h.back()).toBe(v1);
  });
});
