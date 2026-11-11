import type { PropValue, VText } from '../core/html-to-vnode';

export type { EventHandler, PropValue } from '../core/html-to-vnode';

export type ElementProps = Readonly<Record<string, PropValue>>;

/** h()가 받는 children 값. 배열은 펼치고 null·불리언·빈 문자열은 버린다. */
export type Child = HNode | string | number | boolean | null | undefined | readonly Child[];

/** h()로 만든 요소. 자식에 컴포넌트 VNode가 섞일 수 있다. resolve 후에는 Phase 1 VElement가 된다. */
export interface HElement {
  readonly kind: 'element';
  readonly tag: string;
  readonly props: ElementProps;
  readonly children: readonly HNode[];
  readonly key?: string;
}

/** 컴포넌트가 받는 props. children에는 h()에서 정리한 자식이 들어 있다. */
export type ComponentProps<P> = Readonly<P> & { readonly children: readonly HNode[] };

/** 함수형 컴포넌트. props를 받아 화면을 반환한다. */
export type Component<P = Record<string, unknown>> = (props: ComponentProps<P>) => Child;

/** 아직 실행하지 않은 컴포넌트. resolve가 실행해 요소·텍스트로 바꾼다. */
export interface VComponent<P = Record<string, unknown>> {
  readonly kind: 'component';
  readonly type: Component<P>;
  readonly props: ComponentProps<P>;
  readonly key?: string;
}

export type HNode = VText | HElement | VComponent<any>;
