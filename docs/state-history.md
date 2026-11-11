# Core-React: State History 모듈(StateHistory) 개발 기획서

작성일: 2026-11-06

## 1. 개요

Patch가 성공할 때마다 새 VNode를 저장하고, 뒤로가기/앞으로가기로 저장된 VNode 사이를 이동하는 `StateHistory`를 구현한다. DOM을 전혀 다루지 않으며, 화면 반영은 컨트롤러가 `diff` → `applyPatches` → `serialize`로 처리한다.

| 항목 | 내용 |
|------|------|
| 입력 | 저장할 VNode, 뒤로가기/앞으로가기 요청 |
| 출력 | 이동할 VNode, `canBack`, `canForward`, 현재 위치 |
| 사용처 | 페이지 로드(최초 저장), Patch 버튼, 뒤로가기/앞으로가기 버튼 |
| 모델 | 브라우저 뒤로가기 / 편집기 Undo·Redo와 같은 방식 |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | 저장(`push`), 뒤로(`back`), 앞으로(`forward`), 상태 조회 |
| 제외 | 화면 반영, 버튼 이벤트 연결 (검증 페이지 조립 단계) |
| 후속 | 특정 위치로 바로 이동(`goTo`) |

## 3. 데이터 구조

| 필드 | 설명 |
|------|------|
| `snapshots` | VNode 배열. 0번이 최초 상태 |
| `cursor` | 현재 보고 있는 VNode의 인덱스 |

```
snapshots:  [ v0 ][ v1 ][ v2 ][ v3 ]
                         ▲
                       cursor = 2
```

VNode를 복사하지 않고 그대로 저장한다.

- **이유:** VNode는 생성 시 동결되어 있어 누구도 수정할 수 없다. 복사 없이 같은 객체를 공유해도 과거 상태가 바뀌지 않는다.

## 4. 동작 규칙

### 4.1 push(vnode)

1. `cursor` 뒤의 기록을 모두 버린다.
2. `vnode`를 끝에 추가한다.
3. `cursor`를 끝으로 옮긴다.

```
push 전:  [ v0 ][ v1 ][ v2 ][ v3 ]     cursor = 1
push(v4): [ v0 ][ v1 ][ v4 ]           cursor = 2   ← v2, v3 버려짐
```

- **이유:** 과거로 돌아가 새로 수정하면 이전의 "미래"는 더 이상 이어지지 않는다.

### 4.2 back()

| 조건 | 결과 |
|------|------|
| `cursor > 0` | `cursor - 1`, 그 위치의 VNode 반환 |
| `cursor === 0` | 아무것도 바꾸지 않고 `null` 반환 |

### 4.3 forward()

| 조건 | 결과 |
|------|------|
| `cursor < 마지막 인덱스` | `cursor + 1`, 그 위치의 VNode 반환 |
| 마지막 위치 | 아무것도 바꾸지 않고 `null` 반환 |

### 4.4 상태 조회

| 이름 | 값 |
|------|----|
| `current` | `snapshots[cursor]` |
| `canBack` | `cursor > 0` |
| `canForward` | `cursor < snapshots.length - 1` |
| `position` | `{ index: cursor + 1, total: snapshots.length }` — 화면에 `2 / 5`로 표시 |

## 5. 컨트롤러에서의 사용 흐름

`StateHistory` 자체는 저장과 이동만 한다. 화면 반영은 컨트롤러가 다음 순서로 처리한다.

**페이지 로드**

```
v0 = fromDom(실제 영역).vnode → mount(실제 영역, v0) → textarea.value = serialize(v0) → history.push(v0)
```

**Patch 버튼**

```
from = history.current
to   = fromHtml(textarea.value)          ← ok가 false면 중단
patches = diff(from, to)                 ← 빈 배열이면 중단 (저장 안 함)
applyPatches(실제 영역, patches)
history.push(to)
```

**뒤로가기 / 앞으로가기**

```
from = history.current
to   = history.back()   (또는 forward())  ← null이면 중단
patches = diff(from, to)
applyPatches(실제 영역, patches)         ← 실패하면 mount(실제 영역, to)로 복구
textarea.value = serialize(to)
```

모든 동작 후 `canBack`, `canForward`로 버튼의 `disabled`를, `position`으로 위치 표시를 갱신한다.

## 6. 함수 단위 설계

### 6.1 파일 구성

```
src/state/
└─ history.ts   # StateHistory 클래스
```

### 6.2 메서드 목록

| 메서드 / 속성 | 입력 → 출력 | DOM 의존 |
|---------------|-------------|----------|
| `push` | VNode → 없음 | X |
| `back` | 없음 → VNode 또는 `null` | X |
| `forward` | 없음 → VNode 또는 `null` | X |
| `current` | → VNode 또는 `null` (비어 있을 때) | X |
| `canBack` | → boolean | X |
| `canForward` | → boolean | X |
| `position` | → `{ index, total }` | X |

브라우저 없이 테스트한다.

## 7. 기대 입출력

| 순서 | 호출 | 반환 | 기록 상태 | position | canBack | canForward |
|------|------|------|-----------|----------|---------|------------|
| 1 | `push(v0)` | — | [v0] | 1 / 1 | false | false |
| 2 | `push(v1)` | — | [v0, v1] | 2 / 2 | true | false |
| 3 | `push(v2)` | — | [v0, v1, v2] | 3 / 3 | true | false |
| 4 | `back()` | v1 | [v0, v1, v2] | 2 / 3 | true | true |
| 5 | `back()` | v0 | [v0, v1, v2] | 1 / 3 | false | true |
| 6 | `back()` | null | [v0, v1, v2] | 1 / 3 | false | true |
| 7 | `forward()` | v1 | [v0, v1, v2] | 2 / 3 | true | true |
| 8 | `push(v3)` | — | [v0, v1, v3] | 3 / 3 | true | false |
| 9 | `forward()` | null | [v0, v1, v3] | 3 / 3 | true | false |

8번에서 v2가 버려진다.

## 8. 테스트 계획

| 입력 | 기대 |
|------|------|
| 7장 순서대로 호출 | 각 단계의 반환값과 상태가 7장과 일치 |
| 빈 기록에서 `current` | `null` |
| 빈 기록에서 `back()` / `forward()` | `null`, 오류 없음 |
| `back()`으로 받은 VNode | push했던 객체와 같은 객체 (`===`) |
| 저장된 VNode 수정 시도 | 동결되어 변경 안 됨, 기록 내용 유지 |
| push 100회 후 back 99회 | `current`가 최초 VNode |

## 9. 작업 분해

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `push`, `current`, `position` | 7장 1~3번 일치 |
| 2 | `back`, `forward`, `canBack`, `canForward` | 7장 4~7, 9번 일치 |
| 3 | 미래 기록 버리기 | 7장 8번 일치 |
| 4 | 8장 테스트 전체 | 전부 통과 |

## 10. 결정 사항 및 리스크

| 항목 | 내용 |
|------|------|
| 결정 필요 | 최대 저장 개수 제한 (현재 안: 제한 없음. 필요 시 오래된 것부터 삭제하고 `cursor` 보정) |
| 결정 필요 | Patch가 빈 배열일 때 저장 여부 (현재 안: 저장 안 함 — 컨트롤러에서 처리) |
| 결정 필요 | 특정 위치로 바로 이동(`goTo`) 추가 여부 (현재 안: 후속) |
| 리스크 | 테스트 영역을 수정만 하고 Patch 없이 뒤로가기를 누르면 수정 내용이 사라짐 → 수정 중이면 확인 창을 띄울지 페이지 조립 단계에서 결정 |
