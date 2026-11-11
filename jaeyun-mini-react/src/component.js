// component.js — Phase 2: FunctionComponent + useState / useEffect / useMemo
// 렌더링 결과(VNode)는 Phase 1의 diff()/patch()로 실제 DOM에 반영한다.
//
// 과제 제약: Hook은 루트 컴포넌트에서만 사용한다. 자식 컴포넌트는 props만 받는 순수 함수다.
// (실제 React는 자식 컴포넌트도 Hook/State를 가질 수 있다.)

import { createDom, COMPONENT, ELEMENT } from './vdom.js';
import { diff } from './diff.js';
import { patch } from './patch.js';

// 지금 렌더링 중인 루트 컴포넌트. Hook 함수들은 이 변수를 통해 hooks 배열에 접근한다.
let currentComponent = null;

export class FunctionComponent {
  constructor(fn, props = {}) {
    this.fn = fn;           // 루트 함수형 컴포넌트 (예: App)
    this.props = props;
    this.hooks = [];        // Hook 상태 저장소. 렌더링 사이에도 유지된다.
    this.hookIndex = 0;     // 이번 렌더링에서 몇 번째 Hook을 호출 중인지
    this.vnode = null;      // 마지막으로 화면에 반영된 VNode
    this.dom = null;        // 그 VNode에 대응하는 실제 DOM 루트
    this.container = null;
    this.pendingEffects = []; // 이번 렌더링에서 실행해야 할 effect Hook 인덱스
    this.isUpdating = false;
    this.needsUpdate = false;
    this.onCommit = null;   // (선택) patch 후 호출되는 디버그용 콜백: (patches) => {}
  }

  // 컴포넌트 함수를 실행해 "자식 컴포넌트까지 펼친" 순수 VNode 트리를 만든다. DOM은 건드리지 않는다.
  render() {
    this.hookIndex = 0;
    this.pendingEffects = [];
    currentComponent = this;
    let tree;
    try {
      tree = this.fn(this.props);
    } finally {
      currentComponent = null; // 자식 컴포넌트 실행 중 Hook 호출을 막기 위해 먼저 해제
    }
    return expand(tree);
  }

  // 최초 렌더링
  mount(container) {
    this.container = container;
    this.isUpdating = true;
    try {
      this.vnode = this.render();
      this.dom = createDom(this.vnode);
      container.replaceChildren(this.dom);
      this.commitEffects([]);
    } finally {
      this.isUpdating = false;
    }
    if (this.needsUpdate) {
      this.needsUpdate = false;
      this.update();
    }
    return this.dom;
  }

  // 상태 변경 후 렌더링: 재실행 -> 새 VNode -> diff -> patch -> effect
  update() {
    if (this.isUpdating) {
      // effect 안에서 setState가 호출된 경우: 지금 갱신이 끝난 뒤 한 번 더 실행
      this.needsUpdate = true;
      return;
    }
    this.isUpdating = true;
    try {
      const nextVNode = this.render();
      const patches = diff(this.vnode, nextVNode);
      this.dom = patch(this.dom, patches);
      this.vnode = nextVNode;
      this.commitEffects(patches);
    } finally {
      this.isUpdating = false;
    }
    if (this.needsUpdate) {
      this.needsUpdate = false;
      this.update();
    }
  }

  // DOM patch가 끝난 뒤 effect 실행. 재실행할 effect는 cleanup을 먼저 부른다.
  commitEffects(patches) {
    const effectIndexes = this.pendingEffects;
    this.pendingEffects = [];
    for (const index of effectIndexes) {
      const hook = this.hooks[index];
      if (typeof hook.cleanup === 'function') hook.cleanup();
      const result = hook.effect();
      hook.cleanup = typeof result === 'function' ? result : null;
    }
    if (this.onCommit) this.onCommit(patches);
  }

  // 컴포넌트 제거: 남은 cleanup을 모두 실행하고 DOM을 비운다
  unmount() {
    for (const hook of this.hooks) {
      if (hook?.kind === 'effect' && typeof hook.cleanup === 'function') hook.cleanup();
    }
    this.container?.replaceChildren();
    this.vnode = this.dom = null;
  }
}

// 컴포넌트 VNode {type:'component'}를 실행 결과로 바꿔 요소/텍스트 VNode만 남긴다.
// 컴포넌트 관계(App -> Counter)는 여기서 사라지고, DOM 관계(div > button)만 남는다.
function expand(node) {
  if (node.type === COMPONENT) return expand(node.fn(node.props));
  if (node.type === ELEMENT) return { ...node, children: node.children.map(expand) };
  return node; // 텍스트
}

// ---------- Hooks ----------

// 현재 컴포넌트와 이번 Hook의 인덱스를 꺼낸다. 호출할 때마다 인덱스가 1씩 증가한다.
function nextHook(kind) {
  const component = currentComponent;
  if (!component) {
    throw new Error('Hook은 루트 컴포넌트 함수가 렌더링되는 동안에만 호출할 수 있습니다. (자식 컴포넌트는 Stateless)');
  }
  const index = component.hookIndex++;
  const hook = component.hooks[index];
  if (hook && hook.kind !== kind) {
    // 조건문 안에서 Hook을 호출해 순서가 바뀌면 이전 렌더링의 다른 Hook 칸을 읽게 된다
    throw new Error(`Hook 호출 순서가 바뀌었습니다: ${index}번 칸은 ${hook.kind}인데 ${kind}로 호출됨`);
  }
  return { component, index, hook };
}

export function useState(initialValue) {
  const { component, index, hook: existing } = nextHook('state');
  const hook =
    existing ||
    (component.hooks[index] = {
      kind: 'state',
      value: typeof initialValue === 'function' ? initialValue() : initialValue, // 최초 렌더링에만 사용
    });

  // setState는 hook 객체를 클로저로 기억한다 -> 나중에 이벤트에서 호출돼도 같은 칸을 고친다
  const setState = (next) => {
    const value = typeof next === 'function' ? next(hook.value) : next; // 함수형 업데이트
    if (Object.is(value, hook.value)) return; // 같은 값이면 렌더링 생략
    hook.value = value;
    component.update();
  };
  return [hook.value, setState];
}

export function useEffect(effect, deps) {
  const { component, index, hook: existing } = nextHook('effect');
  const hook = existing || (component.hooks[index] = { kind: 'effect', deps: undefined, cleanup: null, effect: null });

  // deps 없음 -> 매 렌더링 실행 / [] -> 최초 1회 / [a, b] -> 값이 바뀔 때만
  const shouldRun = !existing || deps === undefined || depsChanged(hook.deps, deps);
  if (shouldRun) {
    hook.effect = effect;
    hook.deps = deps;
    component.pendingEffects.push(index); // 지금 실행하지 않고 patch 이후 commitEffects에서 실행
  }
}

export function useMemo(factory, deps) {
  const { component, index, hook: existing } = nextHook('memo');
  if (existing && !depsChanged(existing.deps, deps)) return existing.value; // 캐시 재사용
  const value = factory(); // 최초 또는 deps 변경 시 재계산
  component.hooks[index] = { kind: 'memo', value, deps };
  return value;
}

function depsChanged(prevDeps, nextDeps) {
  if (prevDeps === undefined || nextDeps === undefined) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  return nextDeps.some((dep, i) => !Object.is(dep, prevDeps[i]));
}
