export const ROOT_TAG = '#root';

export interface VText {
  readonly kind: 'text';
  readonly text: string;
}

export interface VElement {
  readonly kind: 'element';
  /** localName 그대로. 루트는 ROOT_TAG. */
  readonly tag: string;
  readonly props: Readonly<Record<string, string>>;
  readonly children: readonly VNode[];
  /** data-key 값. 없으면 필드 자체를 생략한다. */
  readonly key?: string;
}

export type VNode = VElement | VText;

export type WarningSeverity = 'error' | 'warn';

export type WarningCode =
  | 'INPUT_TOO_LARGE'
  | 'SANITIZED_ELEMENT'
  | 'SANITIZED_ATTR'
  | 'DUPLICATE_KEY';

export interface ConvertWarning {
  readonly severity: WarningSeverity;
  readonly code: WarningCode;
  /** 루트로부터의 VNode 자식 인덱스 배열 */
  readonly path: readonly number[];
  readonly detail: string;
}

export interface FromHtmlResult {
  readonly vnode: VElement;
  readonly warnings: readonly ConvertWarning[];
  /** error 경고가 없으면 true. false면 Patch를 진행하지 않는다. */
  readonly ok: boolean;
}
