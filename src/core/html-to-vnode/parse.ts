export const MAX_INPUT_LENGTH = 500_000;

/** textContent는 초기값을 돌려주므로 사용자가 수정한 내용은 value로 읽는다. */
export function readSource(textarea: HTMLTextAreaElement): string {
  return textarea.value;
}

export function checkSize(html: string): boolean {
  return html.length <= MAX_INPUT_LENGTH;
}

/**
 * template 내부는 비활성 문서라 <img onerror> 같은 코드가 파싱 중에 실행되지 않는다.
 * 잘못된 HTML도 브라우저 파서가 복구하므로 실패하지 않는다.
 */
export function parseToFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}
