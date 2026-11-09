const BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'style',
  'link',
  'meta',
  'base',
  'template',
]);

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);

export function isBlockedTag(tag: string): boolean {
  return BLOCKED_TAGS.has(tag.toLowerCase());
}

export function isEventAttr(name: string): boolean {
  return name.toLowerCase().startsWith('on');
}

export function isUrlAttr(name: string): boolean {
  return URL_ATTRS.has(name.toLowerCase());
}

/**
 * javascript: 링크 판별.
 * 브라우저는 URL에서 탭·줄바꿈을 지우고 앞뒤 제어문자를 무시하므로,
 * 공백과 제어문자(U+0000~U+0020)를 모두 지운 뒤 대소문자 없이 비교한다.
 */
export function isDangerousUrl(value: string): boolean {
  let compact = '';
  for (const ch of value) {
    if (ch.charCodeAt(0) > 0x20) compact += ch;
  }
  return compact.toLowerCase().startsWith('javascript:');
}
