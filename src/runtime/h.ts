import { extractKey, normalizeChildren, normalizeProps } from './normalize';
import type { Child, Component, HElement, VComponent } from './types';

type KeyProp = { readonly key?: string | number | null };

/**
 * JSX 대신 VNode를 만든다.
 * - 문자열 type: 요소 VNode. Phase 1과 같이 key는 props['data-key']에도 넣는다.
 * - 함수 type: 컴포넌트 VNode. 실행은 resolve가 한다.
 * 만든 VNode는 Phase 1과 같이 즉시 동결한다.
 */
export function h(type: string, props?: (Readonly<Record<string, unknown>> & KeyProp) | null, ...children: Child[]): HElement;
export function h<P>(type: Component<P>, props?: (P & KeyProp) | null, ...children: Child[]): VComponent<P>;
export function h(
  type: string | Component<any>,
  props?: Readonly<Record<string, unknown>> | null,
  ...children: Child[]
): HElement | VComponent<any> {
  const normalizedChildren = Object.freeze(normalizeChildren(children));
  const key = extractKey(props);

  if (typeof type === 'string') {
    const elementProps = normalizeProps(props);
    if (key !== undefined) elementProps['data-key'] = key;
    Object.freeze(elementProps);
    const element: HElement =
      key === undefined
        ? { kind: 'element', tag: type, props: elementProps, children: normalizedChildren }
        : { kind: 'element', tag: type, props: elementProps, children: normalizedChildren, key };
    return Object.freeze(element);
  }

  if (typeof type !== 'function') throw new TypeError('h()의 type은 태그 문자열이나 컴포넌트 함수여야 합니다');

  const componentProps: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props ?? {})) {
    if (name !== 'key') componentProps[name] = value;
  }
  componentProps.children = normalizedChildren;
  // 자식 컴포넌트가 props를 고칠 수 없도록 동결해서 넘긴다.
  Object.freeze(componentProps);

  const component: VComponent<any> =
    key === undefined
      ? { kind: 'component', type, props: componentProps as VComponent<any>['props'] }
      : { kind: 'component', type, props: componentProps as VComponent<any>['props'], key };
  return Object.freeze(component);
}
