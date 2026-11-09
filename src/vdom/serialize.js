/**
 * Virtual DOM  →  HTML 문자열. (테스트 영역의 "HTML 코드 편집" 창에 보여주기 위해 사용)
 *
 * pretty 모드의 규칙: 자식이 전부 요소/주석인 요소만 줄바꿈·들여쓰기를 한다.
 * 텍스트가 섞여 있으면 한 줄로 두어 공백이 텍스트에 섞여 들어가지 않게 한다.
 * (→ 출력한 HTML 을 다시 파싱해도 같은 VNode 가 나온다)
 */

import { COMMENT, ELEMENT, FRAGMENT, TEXT } from './vnode.js';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const NO_PRETTY_TAGS = new Set(['pre', 'textarea', 'script', 'style']);
// HTML 파서는 이 태그 바로 뒤의 첫 줄바꿈 하나를 버린다. 내용이 줄바꿈으로 시작하면 하나를 더 붙여야 왕복이 보존된다.
const LEADING_NEWLINE_DROPPED = new Set(['pre', 'textarea', 'listing']);

/**
 * 주석 내용을 안전하게 만든다. 주석 안에는 `-->`(와 `--!>`)를 쓸 수 없고, `>` 나 `->` 로 시작할 수 없다.
 * 주석에는 엔티티 이스케이프가 없으므로 어쩔 수 없이 내용을 약간 바꾼다. (주석은 화면에 영향이 없다)
 */
function safeComment(value) {
  let out = value.replace(/--!?>/g, '-- >');
  if (out.startsWith('>') || out.startsWith('->')) out = ` ${out}`;
  if (out.endsWith('<!-')) out += ' ';
  return out;
}

export const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function vnodeToHTML(vnode, { pretty = false, indent = '  ' } = {}) {
  return serialize(vnode, { pretty, indent }, 0, false, false);
}

function serialize(v, opts, depth, raw, inPre) {
  switch (v.type) {
    case TEXT:
      return raw ? v.value : escapeText(v.value);
    case COMMENT:
      return `<!--${safeComment(v.value)}-->`;
    case FRAGMENT:
      return serializeChildren(v.children, opts, depth, raw, inPre).text;
    case ELEMENT: {
      const attrs = Object.entries(v.props)
        .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
        .join('');
      const open = `<${v.tag}${attrs}>`;
      if (VOID_TAGS.has(v.tag) && !v.ns) return open;

      const body = serializeChildren(
        v.children,
        opts,
        depth + 1,
        RAW_TEXT_TAGS.has(v.tag),
        inPre || NO_PRETTY_TAGS.has(v.tag),
      );
      if (body.block) return `${open}\n${body.text}\n${opts.indent.repeat(depth)}</${v.tag}>`;
      const first = v.children[0];
      const lead = LEADING_NEWLINE_DROPPED.has(v.tag) && first?.type === TEXT && first.value.startsWith('\n') ? '\n' : '';
      return `${open}${lead}${body.text}</${v.tag}>`;
    }
    default:
      return '';
  }
}

/** @returns {{ text: string, block: boolean }} block 이면 자식들이 각각 한 줄씩 들여쓰기 되어 있다. */
function serializeChildren(children, opts, depth, raw, inPre) {
  const block = opts.pretty && !inPre && children.length > 0 && children.every((c) => c.type !== TEXT);
  if (!block) {
    return { text: children.map((c) => serialize(c, opts, depth, raw, inPre)).join(''), block: false };
  }
  // fragment 루트(depth 0)의 자식은 들여쓰기 없이, element 의 자식은 depth 만큼 들여쓰기
  const pad = opts.indent.repeat(depth);
  return { text: children.map((c) => pad + serialize(c, opts, depth, raw, inPre)).join('\n'), block: true };
}
