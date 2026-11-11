/** 텍스트 이스케이프. nbsp는 textarea에서 일반 공백과 구분되지 않으므로 보이게 바꾼다. */
export function escapeText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(' ', '&nbsp;');
}

/** 속성값 이스케이프. 값은 항상 큰따옴표로 감싸므로 &와 "만 바꾸면 된다. */
export function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
