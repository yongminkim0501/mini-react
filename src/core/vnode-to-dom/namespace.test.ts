import { describe, expect, it } from 'vitest';
import {
  HTML_NAMESPACE,
  MATHML_NAMESPACE,
  SVG_NAMESPACE,
  childNamespace,
  elementNamespace,
} from './namespace';

describe('elementNamespace', () => {
  it('기본은 부모 네임스페이스를 따른다', () => {
    expect(elementNamespace(HTML_NAMESPACE, 'div')).toBe(HTML_NAMESPACE);
    expect(elementNamespace(SVG_NAMESPACE, 'circle')).toBe(SVG_NAMESPACE);
  });

  it('svg, math 태그에서 네임스페이스가 바뀐다', () => {
    expect(elementNamespace(HTML_NAMESPACE, 'svg')).toBe(SVG_NAMESPACE);
    expect(elementNamespace(HTML_NAMESPACE, 'math')).toBe(MATHML_NAMESPACE);
  });
});

describe('childNamespace', () => {
  it('svg의 자식은 SVG다', () => {
    expect(childNamespace(HTML_NAMESPACE, 'svg')).toBe(SVG_NAMESPACE);
  });

  it('SVG 안 foreignObject의 자식은 다시 HTML이다', () => {
    expect(childNamespace(SVG_NAMESPACE, 'foreignObject')).toBe(HTML_NAMESPACE);
  });

  it('math의 자식은 MathML이다', () => {
    expect(childNamespace(HTML_NAMESPACE, 'math')).toBe(MATHML_NAMESPACE);
  });

  it('HTML 요소의 자식은 HTML이다', () => {
    expect(childNamespace(HTML_NAMESPACE, 'div')).toBe(HTML_NAMESPACE);
  });
});
