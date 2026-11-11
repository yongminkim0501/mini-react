import type { VNode } from '../html-to-vnode';
import { createDom } from './createDom';

/**
 * 컨테이너의 내용을 createDom(vnode) 결과로 한 번에 교체한다 (정규화 마운트).
 * 컨테이너 자신과 속성은 건드리지 않는다. 교체 후 컨테이너 DOM과 VNode는 1:1로 일치한다.
 */
export function mount(container: Element, vnode: VNode): void {
  container.replaceChildren(createDom(vnode));
}
