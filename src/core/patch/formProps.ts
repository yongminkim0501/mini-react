/**
 * 폼 요소의 화면 상태(property)를 속성에 맞춘다.
 * 사용자가 한 번이라도 입력한 요소는 속성만 바꿔도 화면 값이 바뀌지 않는다.
 * value는 null이면 속성 삭제를 뜻한다.
 */
export function syncFormProp(element: Element, name: string, value: string | null): void {
  if (name === 'value' && element instanceof HTMLInputElement) {
    // file 입력은 빈 문자열 외의 값을 넣으면 InvalidStateError가 난다.
    if (element.type === 'file') return;
    element.value = value ?? '';
  } else if (name === 'checked' && element instanceof HTMLInputElement) {
    element.checked = value !== null;
  } else if (name === 'selected' && element instanceof HTMLOptionElement) {
    element.selected = value !== null;
  }
}
