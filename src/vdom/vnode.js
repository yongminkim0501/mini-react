/**
 * Virtual DOM 노드 정의.
 *
 * VNode 는 "불변 데이터"로 취급한다. 한 번 만들어진 VNode 는 수정하지 않고,
 * 변경이 필요하면 새 VNode 를 만든다. (히스토리·Diff 가 안전하게 참조를 공유할 수 있다)
 *
 *   text     : { type: 'text',     value }
 *   comment  : { type: 'comment',  value }
 *   element  : { type: 'element',  tag, props, children, ns? }
 *   fragment : { type: 'fragment', children }   ← 컨테이너(영역)의 "내용물" 전체를 표현하는 루트
 *
 * 정규화 규칙 (모든 생성 경로가 지킨다 → DOM 과 VNode 가 1:1 로 대응한다)
 *   1) 빈 문자열 텍스트 노드는 없다.
 *   2) 인접한 텍스트 노드는 하나로 합쳐진다.
 *   3) props 의 값은 항상 문자열이다. (불리언 속성은 '' )
 */

export const TEXT = 'text';
export const COMMENT = 'comment';
export const ELEMENT = 'element';
export const FRAGMENT = 'fragment';

export const NS_HTML = 'http://www.w3.org/1999/xhtml';
export const NS_SVG = 'http://www.w3.org/2000/svg';

export const text = (value) => ({ type: TEXT, value: String(value) });
export const comment = (value) => ({ type: COMMENT, value: String(value) });
export const fragment = (children = []) => ({ type: FRAGMENT, children: normalizeChildren(children) });

/**
 * 요소 VNode 를 "받은 그대로" 만드는 저수준 생성자. h() 와 DOM 변환이 모두 이 함수를 거치므로
 * 정규화 규칙(props 는 문자열, 빈/인접 텍스트 정리)은 여기서 지켜진다.
 *
 * 네임스페이스: ns 는 호출자가 명시한다. 비-HTML ns 를 주면 그 하위 요소들이 ns 를 물려받는다.
 * (<foreignObject> 안은 HTML 이다.) 태그 이름으로 SVG 를 추론하는 것은 편의 함수 h() 의 몫이다.
 */
export function element(tag, props = {}, children = [], ns) {
  let kids = normalizeChildren(children);
  if (ns && ns !== NS_HTML && tag !== 'foreignObject') kids = kids.map((c) => inheritNamespace(c, ns));

  const node = { type: ELEMENT, tag, props: normalizeProps(props), children: kids };
  if (ns && ns !== NS_HTML) node.ns = ns;
  return node;
}

/** 네임스페이스가 없는 요소(와 그 하위)에 ns 를 물려준다. 이미 ns 가 있으면 그대로 둔다. */
function inheritNamespace(node, ns) {
  if (node.type !== ELEMENT || node.ns) return node;
  const children = node.tag === 'foreignObject' ? node.children : node.children.map((c) => inheritNamespace(c, ns));
  return { ...node, ns, children };
}

/**
 * 자식 목록 정규화: 배열 평탄화, null/boolean 제거, 문자열·숫자 → 텍스트 노드,
 * fragment 펼치기, 빈 텍스트 제거, 인접 텍스트 병합.
 */
export function normalizeChildren(input) {
  const out = [];
  const push = (child) => {
    if (child == null || typeof child === 'boolean') return;
    if (Array.isArray(child)) return child.forEach(push);
    if (typeof child === 'string' || typeof child === 'number') child = text(child);
    if (typeof child !== 'object' || !child.type) {
      throw new TypeError(`VNode 로 변환할 수 없는 자식입니다: ${String(child)}`);
    }
    if (child.type === FRAGMENT) return child.children.forEach(push);
    if (child.type === TEXT) {
      if (child.value === '') return;
      const last = out[out.length - 1];
      if (last && last.type === TEXT) {
        out[out.length - 1] = text(last.value + child.value);
        return;
      }
    }
    out.push(child);
  };
  push(input);
  return out;
}

function normalizeProps(props) {
  const out = {};
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue; // 없는 속성
    out[name] = value === true ? '' : String(value);
  }
  return out;
}

/**
 * 사람이 손으로 VNode 를 쓰기 위한 헬퍼. h('div', { id: 'a' }, 'hi', h('b', null, 'x'))
 * <svg> 는 SVG 네임스페이스로 간주하고, 그 하위 요소들이 이를 물려받는다.
 * (브라우저는 SVG 네임스페이스로 만들어야 도형을 그린다.)
 */
export function h(tag, props, ...children) {
  return element(tag, props, children, tag === 'svg' ? NS_SVG : undefined);
}

export const isElement = (v) => v?.type === ELEMENT;
export const isText = (v) => v?.type === TEXT;

/** 형제 사이에서 노드를 식별하는 key. key 속성이 없으면 null (= 위치로 식별). */
export function keyOf(vnode) {
  const key = vnode?.type === ELEMENT ? vnode.props.key : undefined;
  return key === undefined ? null : String(key);
}
