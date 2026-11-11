# Phase 2-5. Hook 실행 환경 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

Hook이 "어느 컴포넌트의 몇 번째 칸"을 쓰는지 찾아주는 공통 장치를 구현한다. `useState`, `useEffect`, `useMemo`는 모두 이 장치를 통해 자기 칸을 받는다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 렌더링 중인 컴포넌트, Hook 호출 순서 |
| 출력 | 해당 Hook의 칸(`hooks[index]`), 규칙 위반 시 오류 |
| 핵심 | **"함수는 매번 새로 실행되는데 상태는 어떻게 유지할까?"에 대한 답** |

---

## 2. 핵심 원리

```
렌더링 1회차                         렌더링 2회차
fn() 실행                            fn() 실행 (새로 실행, 지역 변수는 모두 새것)
 ├ useState(0)    → hooks[0] 생성     ├ useState(0)    → hooks[0] 읽음 (값 3)
 ├ useMemo(…)     → hooks[1] 생성     ├ useMemo(…)     → hooks[1] 읽음
 └ useEffect(…)   → hooks[2] 생성     └ useEffect(…)   → hooks[2] 읽음
```

- 상태는 함수 안이 아니라 **`FunctionComponent` 인스턴스의 `hooks` 배열**에 있다.
- Hook은 이름이 아니라 **호출 순서(인덱스)** 로 자기 칸을 찾는다.
- 그래서 Hook은 매 렌더링마다 같은 순서, 같은 개수로 호출되어야 한다. (조건문·반복문 안 금지)

---

## 3. 전역 상태

| 변수 | 설명 |
| --- | --- |
| `currentComponent` | 지금 렌더링 중인 루트 `FunctionComponent` (없으면 `null`) |
| `hookIndex` | 이번 렌더링에서 다음 Hook이 받을 칸 번호 |
| `isRenderingChild` | 자식 컴포넌트 실행 중 여부 (3단계 `resolve`가 켜고 끔) |

- **전역 변수를 써도 되는 이유**: JS는 한 번에 한 함수만 실행한다. 렌더링은 중간에 끊기지 않으므로 동시에 두 컴포넌트가 렌더링되는 일이 없다.
- 렌더링 시작 시 이전 값을 저장했다가 끝나면 되돌린다. 렌더링 안에서 다른 인스턴스를 렌더링하는 경우에도 값이 섞이지 않는다.

---

## 4. 처리 흐름

### 4.1 렌더링 시작 / 종료 (4단계 `render`가 호출)

| 함수 | 동작 |
| --- | --- |
| `beginRender(component)` | 이전 값 저장, `currentComponent = component`, `hookIndex = 0` |
| `endRender()` | 저장한 값으로 되돌림, 이번 Hook 개수(`hookIndex`) 반환 |

### 4.2 칸 받기 (`useHookSlot(kind)`)

```
[1] currentComponent가 없음        → 오류 "Hook은 컴포넌트 렌더링 중에만 호출할 수 있습니다"
[2] isRenderingChild가 참          → 오류 "Hook은 루트 컴포넌트에서만 사용할 수 있습니다"
[3] index = hookIndex++
[4] hooks[index]가 없음            → 첫 렌더링. 칸 없이 반환 (각 Hook이 만들어 넣음)
[5] hooks[index].kind !== kind     → 오류 "Hook 호출 순서가 바뀌었습니다"
[6] { component, index, slot } 반환
```

### 4.3 칸 종류

| `kind` | 사용 Hook | 저장 내용 |
| --- | --- | --- |
| `state` | `useState` | `value`, `setState` |
| `effect` | `useEffect` | `deps`, `cleanup` |
| `memo` | `useMemo` | `deps`, `value` |

### 4.4 의존성 비교 (`depsChanged(prev, next)`)

`useEffect`, `useMemo`가 함께 쓴다.

| 조건 | 결과 |
| --- | --- |
| `next`가 `undefined` | 바뀜 (매번 실행) |
| `prev`가 없음 (첫 렌더링) | 바뀜 |
| 길이가 다름 | 바뀜 |
| 같은 위치의 값 중 하나라도 `Object.is`가 거짓 | 바뀜 |
| 그 외 | 같음 |

- **`Object.is`를 쓰는 이유**: `===`는 `NaN === NaN`이 거짓이라 `NaN`이 들어가면 매번 바뀐 것으로 본다.

---

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/runtime/
└─ hookRuntime.ts
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 | 순수 함수 |
| --- | --- | --- |
| `beginRender` | 컴포넌트 → 없음 | X |
| `endRender` | 없음 → Hook 개수 | X |
| `setRenderingChild` | boolean → 이전 값 | X |
| `useHookSlot` | kind → `{ component, index, slot }` | X |
| `depsChanged` | 이전 deps, 새 deps → boolean | O |

---

## 6. 기대 입출력

**컴포넌트**

```js
function App() {
  const [a] = useState(1)       // 칸 0
  const doubled = useMemo(() => a * 2, [a])  // 칸 1
  useEffect(() => {}, [a])      // 칸 2
  return h('p', null, doubled)
}
```

**첫 렌더링 후 `hooks`**

```js
[
  { kind: 'state',  value: 1, setState },
  { kind: 'memo',   deps: [1], value: 2 },
  { kind: 'effect', deps: [1], cleanup: undefined }
]
```

**오류 사례**

| 코드 | 결과 |
| --- | --- |
| 컴포넌트 밖에서 `useState(0)` | 오류: 렌더링 중에만 호출 가능 |
| 자식 컴포넌트에서 `useState(0)` | 오류: 루트 컴포넌트에서만 사용 가능 |
| `if (flag) useState(0)` 후 `flag` 변경 | 오류: Hook 개수 변경 (4단계) 또는 순서 변경 |

**`depsChanged`**

| 이전 | 새 | 결과 |
| --- | --- | --- |
| `[1, 'a']` | `[1, 'a']` | false |
| `[1]` | `[2]` | true |
| `[NaN]` | `[NaN]` | false |
| `[{}]` | `[{}]` (다른 객체) | true |
| `[1]` | `undefined` | true |

---

## 7. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 6장 컴포넌트 | 6장 `hooks`와 일치 |
| 6장 오류 사례 | 각각 해당 오류 |
| `depsChanged` 표 | 표와 일치 |
| 렌더링 2회 | 두 번째 렌더링에서 새 칸이 생기지 않고 기존 칸을 읽음 |
| 렌더링 후 `currentComponent` | `null`로 되돌아감 |
| 렌더링 중 오류 발생 | `currentComponent`가 그래도 되돌아감 |

---

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | `depsChanged` | 표 테스트 통과 |
| 2 | `beginRender` / `endRender` (오류 시에도 복구) | 복구 테스트 통과 |
| 3 | `useHookSlot` 오류 판정 | 오류 사례 통과 |
| 4 | `resolve`와 `isRenderingChild` 연결 | 자식 Hook 금지 통과 |

---

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | 오류 메시지 언어 (현재 안: 한국어) |
| 리스크 | Hook 순서 오류는 실행해 봐야 알 수 있음 → 칸 종류(`kind`) 확인으로 최대한 빨리 발견 |
