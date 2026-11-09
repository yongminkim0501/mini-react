import { describe, expect, it } from 'vitest';
import { isBlockedTag, isDangerousUrl } from './sanitize';
import { normalizeClass, normalizeText } from './text';

describe('normalizeText', () => {
  it('줄바꿈 섞인 공백만 있으면 버린다', () => {
    expect(normalizeText('\n   ', false)).toBeNull();
  });

  it('줄바꿈 없는 공백은 한 칸으로 남긴다', () => {
    expect(normalizeText('   ', false)).toBe(' ');
  });

  it('양 끝 들여쓰기는 버리고 가운데 공백은 한 칸으로 줄인다', () => {
    expect(normalizeText('\n  안녕   세상  \n', false)).toBe('안녕 세상');
  });

  it('줄바꿈 없는 양 끝 공백은 유지한다', () => {
    expect(normalizeText(' 안녕 ', false)).toBe(' 안녕 ');
  });

  it('nbsp는 공백으로 취급하지 않는다', () => {
    expect(normalizeText('a  b', false)).toBe('a  b');
  });

  it('공백 보존 모드에서는 그대로 둔다', () => {
    expect(normalizeText('\n  a\n  b  ', true)).toBe('\n  a\n  b  ');
  });
});

describe('normalizeClass', () => {
  it('공백을 한 칸으로 줄이고 양 끝을 자른다', () => {
    expect(normalizeClass('  a   b ')).toBe('a b');
  });
});

describe('isDangerousUrl', () => {
  it('대소문자와 앞 공백을 섞은 우회를 잡는다', () => {
    expect(isDangerousUrl(' JaVaScRiPt:alert(1)')).toBe(true);
  });

  it('탭을 끼운 우회를 잡는다', () => {
    expect(isDangerousUrl('java\tscript:x')).toBe(true);
  });

  it('경로에 javascript가 들어간 일반 링크는 통과시킨다', () => {
    expect(isDangerousUrl('/javascript/guide')).toBe(false);
  });
});

describe('isBlockedTag', () => {
  it('script를 차단한다', () => {
    expect(isBlockedTag('script')).toBe(true);
  });

  it('일반 태그는 통과시킨다', () => {
    expect(isBlockedTag('div')).toBe(false);
  });
});
