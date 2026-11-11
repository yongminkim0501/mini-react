export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

export type Namespace = typeof HTML_NAMESPACE | typeof SVG_NAMESPACE | typeof MATHML_NAMESPACE;

/** 요소 자신의 네임스페이스. svg, math 태그에서 바뀌고 그 외에는 부모 것을 물려받는다. */
export function elementNamespace(parent: Namespace, tag: string): Namespace {
  if (tag === 'svg') return SVG_NAMESPACE;
  if (tag === 'math') return MATHML_NAMESPACE;
  return parent;
}

/** 요소의 자식이 쓸 네임스페이스. SVG의 foreignObject 안은 다시 HTML이다. */
export function childNamespace(parent: Namespace, tag: string): Namespace {
  const own = elementNamespace(parent, tag);
  if (own === SVG_NAMESPACE && tag === 'foreignObject') return HTML_NAMESPACE;
  return own;
}
