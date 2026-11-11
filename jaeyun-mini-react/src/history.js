// history.js — Phase 1의 VNode 스냅샷 기록 (뒤로가기/앞으로가기)
// 저장·반환할 때마다 structuredClone으로 깊은 복사를 해서,
// 나중에 바깥에서 객체를 고쳐도 저장된 기록이 오염되지 않게 한다.

export class History {
  constructor(initialVNode) {
    this.states = [structuredClone(initialVNode)];
    this.index = 0; // 현재 보고 있는 스냅샷 위치
  }

  get current() {
    return structuredClone(this.states[this.index]);
  }

  push(vnode) {
    // 뒤로가기 한 상태에서 새로 저장하면, 앞으로가기 가능했던 기록은 버린다 (redo 분기 제거)
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(structuredClone(vnode));
    this.index = this.states.length - 1;
  }

  canUndo() {
    return this.index > 0;
  }

  canRedo() {
    return this.index < this.states.length - 1;
  }

  undo() {
    if (this.canUndo()) this.index--;
    return this.current;
  }

  redo() {
    if (this.canRedo()) this.index++;
    return this.current;
  }
}
