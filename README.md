# mini-react
크래프톤 정글 11주차 미니 리액트 구현

## 히트맵 탐색기와 측정 방법

현재 엔진(동기 재귀 렌더링, 이하 stack)으로 실제 앱을 만들어 세 가지 문제를 잰다. 대규모 업데이트 중 UI 멈춤, 타이핑·클릭 렉, 애니메이션 끊김이다. 이후 Fiber 엔진을 같은 페이지에 연결해 비교한다. 결정 근거는 [`docs/decisions.md`](docs/decisions.md)에 있다.

### 실행

```bash
npm install
npm run dev
# http://localhost:5173/lab/pages/heatmap.html?engine=stack&size=10000&seed=42
```

테스트는 `npm run test:run`(엔진 + lab 순수 모듈), 빌드는 `npm run build`다.

### URL 파라미터

| 이름 | 기본값 | 설명 |
|------|--------|------|
| `engine` | `stack` | `stack` \| `fiber-sync` \| `fiber-slice` \| `fiber`. 지금은 `stack`만 구현돼 있고, 나머지는 "not implemented" 오류를 화면에 띄운다. |
| `size` | `10000` | 셀 수. 2,000~20,000, 1,000 단위다(날짜 100열 × 카테고리 행). |
| `seed` | `42` | 데이터·클릭 대상 시드. 모든 무작위성은 이 시드를 쓰는 mulberry32를 거친다. |
| `cellCost` | `0` | 셀 렌더 1회당 인공 CPU 부하(ms). 기본은 끔이다. 자연 비용이 부족할 때만 쓴다. |
| `scenario` | 없음 | `S1`~`S4`. 쉼표로 여러 개를 줄 수 있다. |
| `runs` | `3` | 시나리오 반복 횟수. 결과는 평균이다. |
| `autorun` | 없음 | `1`이면 로드 후 시나리오를 자동 실행한다. 결과는 `window.__lab.results`에 들어간다. |
| `hud` | 없음 | `record`면 녹화용 HUD를 띄운다(엔진 이름, 시나리오, 프레임 그래프, 핵심 숫자). |

예: `?engine=stack&size=10000&scenario=S2&runs=3&autorun=1&hud=record`

### 앱 구성

- 루트 `App`만 상태를 가진다: `query`, `matchQuery`, `threshold`, `size`, `seed`, `selected`.
  - `useMemo`로 데이터 생성, 검색 매칭, 통계를 계산한다.
  - `useEffect`로 셀을 선택하면 `document.title`을 바꾼다.
- 자식은 props만 받는 순수 함수다: `SearchBar`, `Controls`, `Heatmap`/`Row`/`Cell`, `StatsPanel`, `DetailPanel`, `ClickCounter`.
- 검색 입력: `setQuery(v)` 후 `startTransition(() => setMatchQuery(v))`. stack에서는 우선순위가 없어 즉시 실행된다.
- 셀 클릭: `Heatmap` 컨테이너 하나의 `onClick`이 `event.target.dataset`으로 셀을 찾는다.
- 진행 바: 별개의 두 번째 루트 `ProgressApp`이 rAF마다 `setProgress`한다. CSS 애니메이션은 쓰지 않는다.

### 시나리오

| ID | 내용 | 주로 보는 지표 |
|----|------|----------------|
| S1 | 데이터 재생성을 2초 간격으로 3회 | 업데이트당 렌더 시간, 최장 Long Task, 프레임 최대 |
| S2 | 100ms 간격으로 20글자 입력 (값 설정 후 `input` 이벤트) | 입력 지연, 키 입력당 렌더 시간 |
| S3 | 재생성 직후 200ms 간격으로 셀 클릭 10회 | 클릭 지연 |
| S4 | 5초 동안 재생성을 연속 실행 | 진행 바 fps, 끊긴 프레임 수 |

실행마다 히트맵 루트를 같은 props로 다시 마운트해서 같은 상태에서 시작한다. 결과 표는 페이지 아래 "측정" 패널에 나오고, "JSON 내려받기"로 실행별 원자료까지 받을 수 있다.

### 지표 정의

| 지표 | 정의 |
|------|------|
| 프레임 간격 | 측정 도구 자체 rAF 사이 간격. p50/p95/max, 33ms 초과 수 |
| Long Task | `PerformanceObserver('longtask')`로 잰 50ms 초과 작업의 수와 최장 시간. 지원하지 않는 브라우저는 "측정 불가" |
| 입력 지연 | `input` 이벤트 `timeStamp` → 그 값이 `#echo`에 반영된 커밋 이후 첫 rAF |
| 입력 지연(예정 시각 기준) | 스크립트가 입력하려던 시각 → 같은 끝점. 메인 스레드가 막혀 타이머가 늦게 실행된 시간까지 포함한다 |
| 클릭 지연 | `click` 이벤트 → 선택 정보(`#detail[data-seq]`)가 반영된 커밋 이후 첫 rAF |
| 업데이트당 렌더 시간 | 렌더(루트 실행 + resolve) + 커밋(diff + patch). 첫 마운트는 뺀다 |
| 진행 바 fps / 끊김 | 진행 바 루트의 초당 커밋 수 / 커밋 간격 33ms 초과 횟수 |

### 측정 도구를 엔진 밖에 둔 이유

측정 도구(`lab/metrics.js`, `runner.js`, `hud.js`)는 Vanilla DOM으로만 그린다. 엔진과는 계측 훅과 커밋 직후 DOM 읽기로만 닿는다.

- 측정 도구를 엔진으로 그리면 그 렌더링 비용이 측정 대상에 섞인다.
- 엔진이 메인 스레드를 막으면 측정 도구도 같이 멈춰서, 멈춘 사실을 기록하지 못한다.
- 앱 상태가 아니라 화면에 실제로 반영된 것을 기준으로 재야 엔진을 바꿔도 같은 기준으로 비교할 수 있다.
