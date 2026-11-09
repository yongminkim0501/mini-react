/** 자식 컴포넌트 실행 중 여부. resolve가 켜고 끈다. 켜져 있으면 Hook 호출은 오류다. */
let isRenderingChild = false;

/** 자식 실행 중 표시를 바꾸고 이전 값을 돌려준다. 중첩 자식에서도 끝나면 이전 값으로 되돌린다. */
export function setRenderingChild(value: boolean): boolean {
  const previous = isRenderingChild;
  isRenderingChild = value;
  return previous;
}
