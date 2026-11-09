/**
 * 사용자가 입력한 HTML 을 그대로 실제 DOM 에 심으면 스크립트가 실행될 수 있다.
 * 테스트 영역은 "임의의 HTML 을 자유롭게 입력"받으므로 최소한의 방어선을 둔다.
 *
 *  - 인라인 이벤트 핸들러(on*)  : 차단
 *  - srcdoc                      : 차단
 *  - javascript: / vbscript: URL : 차단 (브라우저가 스킴 안의 공백/제어문자를 무시하므로 먼저 제거)
 *  - <script>                    : 변환 단계에서 제거
 */

export const BLOCKED_TAGS = new Set(['script']);

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster']);

export function isSafeAttribute(name, value = '') {
  const lower = String(name).toLowerCase();
  if (/^on[a-z]/.test(lower)) return false;
  if (lower === 'srcdoc') return false;
  if (URL_ATTRS.has(lower)) {
    // eslint-disable-next-line no-control-regex
    const compact = String(value).replace(/[\u0000- ]/g, '');
    if (/^(javascript|vbscript):/i.test(compact)) return false;
  }
  return true;
}
