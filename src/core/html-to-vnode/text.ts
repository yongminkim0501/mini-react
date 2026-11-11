// \s는 &nbsp;(U+00A0)까지 공백으로 보므로 쓰지 않는다. HTML의 ASCII 공백만 다룬다.
const ASCII_WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f']);

interface Run {
  readonly whitespace: boolean;
  readonly value: string;
}

function splitRuns(value: string): Run[] {
  const runs: Run[] = [];
  let current = '';
  let currentIsWhitespace = false;

  for (const ch of value) {
    const isWhitespace = ASCII_WHITESPACE.has(ch);
    if (current !== '' && isWhitespace !== currentIsWhitespace) {
      runs.push({ whitespace: currentIsWhitespace, value: current });
      current = '';
    }
    current += ch;
    currentIsWhitespace = isWhitespace;
  }
  if (current !== '') runs.push({ whitespace: currentIsWhitespace, value: current });
  return runs;
}

function hasLineBreak(value: string): boolean {
  return value.includes('\n') || value.includes('\r');
}

/**
 * 텍스트 정리 (7단계).
 * 양 끝의 공백 덩어리에 줄바꿈이 섞여 있으면 들여쓰기로 보고 버린다.
 * 그 밖의 공백 덩어리는 화면에 보이므로 한 칸으로 줄인다.
 * 결과가 비면 null.
 */
export function normalizeText(raw: string, preserveWhitespace: boolean): string | null {
  if (preserveWhitespace) return raw === '' ? null : raw;

  const runs = splitRuns(raw);
  let result = '';
  runs.forEach((run, index) => {
    if (!run.whitespace) {
      result += run.value;
      return;
    }
    const atEdge = index === 0 || index === runs.length - 1;
    if (atEdge && hasLineBreak(run.value)) return;
    result += ' ';
  });
  return result === '' ? null : result;
}

export function normalizeClass(value: string): string {
  return splitRuns(value)
    .filter((run) => !run.whitespace)
    .map((run) => run.value)
    .join(' ');
}
