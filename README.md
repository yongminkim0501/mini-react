# mini-react
크래프톤 정글 11주차 미니 리액트 구현

## 단계 1 완료 · stack에서 입력 경로 생략까지

2026-11-11 B-4 진단 승인으로 단계 1을 종료했다. 같은 앱을 다섯 엔진으로 실행할 수 있으며 엔진·앱 구현은 동결한다. B-5, 경계 기록 경량화, CSS 렌더링 격리는 후속 과제로만 남긴다.

### 단계별 사다리 · 20k S1~S4

카운터 OFF 프로덕션 수치가 있는 셀을 우선 사용했다. 초기 세 엔진의 OFF 프로덕션 자료와 S4의 OFF 프로덕션 자료는 없어 기존 개발 서버 값을 출처와 함께 사용했다. **이 표는 서로 다른 시점·빌드의 자료를 모은 사다리이며, 행 사이 차이를 한 세션의 개선율로 계산하지 않는다.** 관문 효과는 아래 동일 관문의 교차 측정 자료로 확인한다.

| 엔진 | 앱 | S1 작업 ms/커밋 | S1 최장 Long Task ms | S2 입력 p95 ms | S3 클릭 p95 ms | S4 진행 바 fps / 커밋 수 | 출처 S1~3 / S4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stack | current | 107.2 | 122.0 | 152.3 | 190.2 | 10.7 / 28.0 | A / A |
| fiber-sync | current | 96.4 | 111.0 | 138.4 | 170.5 | 11.2 / 29.7 | A / A |
| fiber-slice | current | 123.4 | 71.0 | 481.1 | 379.7 | 22.0 / 20.3 | A / A |
| fiber | current | 135.4 | 73.0 | 91.0 | 87.7 | 34.1 / 14.0 | B / C |
| fiber-bailout | cached | 136.3 | 79.0 | 28.2 | 90.5 | 35.6 / 12.7 | B / C |

- **A:** [B-2 원자료](docs/results/fiber-slice-b2/fiber-slice-cross.json), `485435c`, 개발 서버·B-4 카운터 도입 전. stack/fiber-sync/fiber-slice는 같은 세션이다.
- **B:** [프로덕션 OFF 원자료](docs/results/fiber-b4-diagnostics/production.json.gz), `42b0d96`, S1→S3→S2 교차 측정. [분석 JSON](docs/results/fiber-b4-diagnostics/analysis.json)과 [실행별 CSV](docs/results/fiber-b4-diagnostics/production-per-run.csv)도 있다.
- **C:** [B-4 원자료](docs/results/fiber-bailout-b4/fiber-bailout-cross.json), `9b3084e`, 카운터 ON 개발 서버. S4의 fiber/current와 fiber-bailout/cached를 사용했다. 두 조합 모두 데이터 변경으로 경계 적중은 0이다.

[사다리 집계 JSON](docs/results/phase1-summary.json)은 각 셀의 출처·경과 시간·수신/커밋 수·경고를 보존한다. 모든 값은 size=20,000·seed=42·cellCost=0, 조합별 워밍업 1회 제외 3회다. 시간/fps/커밋 수는 실행별 평균의 3회 평균, 지연은 **예정 시각 기준 실행별 p95의 평균**, 최장 Long Task는 3회 전체 최댓값이다. 작업 시간은 양보 대기를 제외한 Render+Commit 구간 합계이며 OS CPU 시간이 아니다.

A의 S4 stack/fiber-sync에는 각각 2/3회의 `in-run-refresh-unstable` 경고가 있다. 표본은 유지했고 사전 60Hz 예산을 바꾸지 않았다. S4 커밋/실행이 다르므로 fps 증가를 같은 처리량의 증가로 읽지 않는다. 결측은 N/A이며 새 측정으로 빈칸을 채우지 않았다.

### 관문별 교훈

| 관문 | 배운 점과 근거 |
| --- | --- |
| B-1 · fiber-sync | 반복 작업 루프·Render/Commit 분리·더블 버퍼링을 만들어도 전체 트리 계산은 남는다. 자료구조만으로 응답 문제가 풀리지 않았고, 같은 B-1 세션의 S4 진행 바는 stack 10.6 / sync 11.2fps였다. [B-1](docs/codex/B1-fiber-sync.md) |
| B-2 · fiber-slice | 5ms 양보가 렌더 계산의 긴 독점을 풀어 S4 진행 바에 숨통을 틔웠지만, 단일 레인의 앞 렌더를 기다리는 입력은 나빠졌다. 같은 B-2 세션의 S2 p95는 stack 152.3 → slice 481.1ms이며 동기 Commit·브라우저 렌더링 비용은 남았다. [B-2](docs/codex/B2-fiber-slice.md) |
| B-3 · fiber | 우선순위·중단/재시작이 입력을 먼저 처리하게 했다. 같은 B-3 세션에서 S2 slice 416.2 → fiber 93.2ms, S3 402.0 → 88.9ms로 줄었지만 Sync의 전체 트리 재조정은 남았다. [B-3](docs/codex/B3-fiber.md) |
| B-4 · fiber-bailout | 입력 경로의 일을 실제로 줄여야 Sync가 짧아진다. 같은 OFF 프로덕션의 cached 앱에서 fiber → bailout은 S2 입력 p95 87.2 → 28.2ms, Sync Render 약 61.6 → 0.195ms였으며 브라우저 프레임 대기는 남았다. [B-4](docs/codex/B4-fiber-bailout.md), [진단](docs/codex/B4-diagnosis.md) |

### 남은 한계

- **S3 클릭:** selected가 바뀌면 Heatmap 캐시가 깨져 Row/Cell 함수를 전부 다시 실행한다. DOM 변경 수가 작아도 함수 재실행 범위는 크다. B-4 Sync 클릭 30건은 내부 DOM 쓰기 57회에 대해 함수 호출 606,030회였다.
- **최종 히트맵 반영:** 입력 echo가 빨라도 Transition의 최종 반영은 늦을 수 있다. B-4의 마지막 attempt 경과 차이 179.5ms 중 작업 차이는 9.4ms였고, 별도 trace 두 표본에서 조각 사이 잔차의 약 93%는 브라우저 렌더링과 겹쳤다. 재측정의 최종 반영은 fiber 432.8 / bailout 408.3ms로 순서도 달라졌다. 폐기 총량을 마지막 입력 뒤 지연의 직접 원인으로 합산하지 않는다.
- **미스 오버헤드:** OFF 프로덕션에서도 커밋당 작업 비용 증가가 S3 +6.3~8.8%, S2 current +9.9%로 남았다. S1은 current +0.05%, cached +9.11%로 분산됐다. “6~10%”는 특정 미스 경로의 관측 범위이며 모든 시나리오의 고정 비용이 아니다. 경계 기록의 할당/조회와 관측 코드·JIT/GC 영향을 구분한다.
- **앱 협조와 계약:** 같은 VComponent를 다시 전달해야 적중한다. 루트의 onSelect/Heatmap VNode useMemo 두 개가 필요하며, current 앱에서 모드만 켜면 적중 없이 기록 비용이 더해진다. 자식은 순수해야 하고 중첩 데이터 제자리 수정은 계약 위반이다. key 비교·bailout/memo의 일반화·자식 Hook/컨텍스트는 이번 범위가 아니다.

### 후속 과제 · 구현하지 않음

| 과제 | 다음에 검토할 범위 |
| --- | --- |
| 행 단위 클릭 | 루트의 고정 useMemo로 rowsBase/rows를 만들고 이전/새 선택 행만 새 VNode로 바꾸는 [rowsBase 설계](docs/codex/B4-design.md). 커밋 안전성과 앱 변형/엔진 비교 공정성을 다시 검증한다. |
| 경계 기록 경량화 | 기록 객체·인덱스·경로 할당과 보유 비용을 줄이는 별도 설계. 이번 진단에서는 위치와 생성 수만 보고했다. |
| CSS 렌더링 격리 | 진행 바 갱신과 큰 히트맵의 Layout/Paint 범위를 분리할 수 있는지 별도 실험한다. 엔진의 Render 생략과 브라우저 렌더링 비용을 각각 측정한다. |

세 과제 모두 별도 승인 전 착수하지 않는다.

### 실제 React와의 대응

[B-4 설계서의 확인 내용](docs/codex/B4-design.md)을 요약한다. 소스 비교 기준은 React **v19.2.0**이며 최신 버전 전체를 재현했다는 뜻은 아니다.

- 이번 방식은 **기본 props 동일성 bailout + JSX 노드 메모이제이션**에 대응한다. 같은 element 객체를 다시 전달하는 [JSX 노드 useMemo](https://react.dev/reference/react/useMemo#memoizing-individual-jsx-nodes) 패턴과 연결된다.
- 실제 React는 props 참조뿐 아니라 업데이트 레인·컨텍스트·하위 작업도 확인한다. 여기서는 루트만 Hook을 가지며 순수 자식의 상태/컨텍스트가 없어 조건이 단순하다.
- [React.memo](https://react.dev/reference/react/memo)는 기본적으로 prop별 Object.is를 비교한다. 이 프로젝트는 같은 부모·같은 위치의 VComponent 객체 ===와 단일 host 반환에 한정한다. 한 host 헤더만 복제하는 방식도 본 프로젝트의 선택이다.
- startTransition은 업데이트의 우선순위를 표시한다. memo 래퍼가 API의 필수 조건은 아니며, 비싼 자식의 같은 입력을 생략할 수 있어야 긴급 경로의 일이 줄어든다. 스케줄링과 생략을 구분한다.

### 재현 · 환경 · 영상

```sh
npm ci
B4_COUNTERS=off npm run build -- --outDir /private/tmp/mini-react-phase1-off
npm run preview -- --host 127.0.0.1 --port 5183 --strictPort --outDir /private/tmp/mini-react-phase1-off
```

5183이 사용 중이면 기존 서버를 먼저 종료한다. [비교 영상용 URL 40개](docs/codex/phase1-recording-urls.md)에 엔진·앱 변형·S1~S4 링크와 녹화 순서를 정리했다. 영상 자체는 생성하지 않았다. 정량 재현은 HUD를 끄고, 영상은 `hud=record`를 사용한다. 영상용 HUD는 추가 작업을 만들며 과거 개발 서버 숫자와 동일하다고 보장하지 않는다.

| 기록된 환경 | 값 |
| --- | --- |
| 브라우저 | Chromium 153.0.8010.12, headed, CPU throttle 1배 |
| viewport / DPR | 1280×720 / 2 |
| 전원 / 논리 코어 | AC 연결·배터리 100% / 10 |
| 사전 프레임 예산 | 60Hz, 16.67ms; 끊김 기준 34.33ms |
| 반복 | 조합당 워밍업 1회 제외 3회 |
| 빌드 | A/C 개발 서버, B는 Vite 프로덕션 build + preview / 카운터 OFF |

추가 환경·시각·코드 커밋은 각 원자료의 environment/provenance에 있다. 프레임 예산은 실행 전 추정으로 고정하며 실행 중 빈도는 진단값이다. 정량 측정·카운터 집계·진단 재현 명령은 아래 측정 방법과 관문 보고서를 참고한다.

### 원자료와 최종 검사

| 자료 | 보고서 / 원자료 |
| --- | --- |
| 초기 stack 기준선 | [보고서](docs/results/stack-baseline.md) / [JSON](docs/results/stack-baseline.json) — 역사 자료, 위 사다리에 섞지 않음 |
| B-1 sync | [보고서](docs/codex/B1-fiber-sync.md) / [JSON](docs/results/fiber-sync-b1/fiber-sync-cross.json) / [trace 집계](docs/results/fiber-sync-b1/trace-summary.json) |
| B-2 slice | [보고서](docs/codex/B2-fiber-slice.md) / [JSON](docs/results/fiber-slice-b2/fiber-slice-cross.json) / [trace 집계](docs/results/fiber-slice-b2/trace-summary.json) |
| B-3 레인/중단 | [보고서](docs/codex/B3-fiber.md) / [JSON](docs/results/fiber-b3/fiber-cross.json) / [trace 집계](docs/results/fiber-b3/trace-summary.json) / [렌더링 진단](docs/results/fiber-b3/layout-diagnostic-summary.json) |
| B-4 경계 생략 | [설계](docs/codex/B4-design.md) / [보고서](docs/codex/B4-fiber-bailout.md) / [JSON](docs/results/fiber-bailout-b4/fiber-bailout-cross.json) / [카운터 CSV](docs/results/fiber-bailout-b4/counters.csv) |
| B-4 승인 후 진단 | [보고서](docs/codex/B4-diagnosis.md) / [분석 JSON](docs/results/fiber-b4-diagnostics/analysis.json) / [프로덕션 JSON.gz](docs/results/fiber-b4-diagnostics/production.json.gz) / [attempt JSON.gz](docs/results/fiber-b4-diagnostics/attempt-original.json.gz) / [trace 세션 JSON.gz](docs/results/fiber-b4-diagnostics/trace.json.gz) |
| 단계 1 요약 | [출처 포함 JSON](docs/results/phase1-summary.json) / [녹화 URL](docs/codex/phase1-recording-urls.md) |

2026-11-11 단계 1 정리 시 Node v26.7.0에서 재실행했다. 새 성능 측정은 하지 않았다.

| 명령 | 실제 결과 |
| --- | --- |
| `npm run test:run` | 35개 파일, 357개 테스트 통과 |
| `npm run typecheck` | tsc --noEmit, 종료 코드 0 |
| `npm run build` | 타입 검사·Vite 프로덕션 빌드, 종료 코드 0 |

## 배포 지연 추적 화면과 측정 방법

동기 재귀 엔진(stack)과 네 Fiber 모드를 같은 앱에 연결해 대규모 업데이트의 UI 멈춤, 타이핑·클릭 지연, 애니메이션 끊김을 측정한다. 단계 1의 구현·측정·진단은 완료했다. 결정 근거는 [`docs/decisions.md`](docs/decisions.md), stack 기준선은 [`docs/results/stack-baseline.md`](docs/results/stack-baseline.md)에 있다.

### 화면의 역할

**배포 직후 지연 이상을 추적하는 장애 대응 화면**이다. 행은 서버(`web-ne-07`), 열은 최근 100분(14:00~15:39), 셀 하나는 그 서버의 그 분 p95 지연(ms)이다. 지연 상승(이상 징후)과 원인 후보(배포 버전, 에러 코드)가 시간·서버 축에서 겹치는지 눈으로 확인한다.

데이터에는 시드로 장애 시나리오를 심었다.

- 평소에는 서버마다 낮은 기준 지연(60~150ms)에 잡음이 섞이고, 드물게 `err-504`가 난다.
- 14:40부터 `deploy-1742`가 서버 묶음 단위로 3분마다 계단식으로 퍼진다(rolling deploy, 12개 묶음).
- 그 배포를 받은 서버의 약 35%에서 몇 분에 걸쳐 지연이 오르고 `err-503`이 난다.

셀 태그는 그 시각의 배포 버전과 에러 코드다(예: `deploy-1742 err-503`). 사용 방법은 다음과 같다.

- 검색창에 `deploy-1742 err-503`을 치면 새 배포와 503이 겹친 칸이 강조되고, 나머지는 흐려진다.
- **SLO 기준(ms)** 슬라이더를 움직이면 기준 안쪽(정상) 셀이 흐려져 위반 구간만 남는다.
- 셀을 클릭하면 그 서버·시각의 지연, 버전, 상태, 배포 시각이 나온다.

**검색은 행을 걸러내지 않고 셀을 강조/흐림으로만 표시한다.** 이 화면에서는 시간·서버 위치 자체가 정보이기 때문이다. 배포가 계단식으로 번진 모양, 에러가 배포 직후부터 시작됐는지, 특정 지역에 몰렸는지는 매칭되지 않은 칸이 제자리에 있어야 보인다. 행을 걸러내면 이 맥락이 사라진다.

**실무 도구는 이런 히트맵을 Canvas로 그리지만, 이 데모는 DOM 재조정 비용을 측정하기 위해 의도적으로 DOM으로 그렸다.** 셀 하나가 div 하나라서 셀 2만 개면 VNode·DOM 노드도 2만 개다.

### 실행

```bash
npm install
npm run dev
# http://localhost:5173/lab/pages/heatmap.html
```

테스트는 `npm run test:run`(엔진 + lab 순수 모듈), 빌드는 `npm run build`다.

### 기준 조건

| 구분 | 조건 |
|------|------|
| 메인 기준 | `size=20000`, `cellCost=0` |
| 보조 기준 | `size=10000`, `cellCost=0` |

`cellCost`(인공 부하)는 예비 옵션으로만 둔다.

### URL 파라미터

| 이름 | 기본값 | 설명 |
|------|--------|------|
| `engine` | `stack` | `stack` \| `fiber-sync` \| `fiber-slice` \| `fiber` \| `fiber-bailout`. `stack`·`fiber-sync`·`fiber-slice`·`fiber`·`fiber-bailout`을 지원한다. |
| `app` / `apps` | `current` | `cached`는 승인된 두 useMemo를 켠다. `apps=current,cached`는 모든 앱×엔진 조합을 실행마다 교차 측정한다. |
| `engines` | 없음 | `stack,fiber-slice,fiber`처럼 여러 개를 주면 실행 단위로 번갈아 측정한다. 구현되지 않은 모드는 건너뛰고 결과의 `skippedEngines`에 남긴다. `engine`보다 우선한다. |
| `size` | `20000` | 셀 수. 2,000~20,000, 1,000 단위다(100분 × 서버 행). |
| `seed` | `42` | 데이터·클릭 대상 시드. 모든 무작위성은 이 시드를 쓰는 mulberry32를 거친다. |
| `cellCost` | `0` | 셀 렌더 1회당 인공 CPU 부하(ms). 예비 옵션이다. |
| `scenario` | 없음 | `S1`~`S4`. 쉼표로 여러 개를 줄 수 있다. 없으면 전부 실행한다. |
| `runs` | `3` | 워밍업을 뺀 반복 횟수. 결과는 평균이다. |
| `autorun` | 없음 | `1`이면 로드 후 자동 실행한다. 결과는 `window.__lab.results`에 들어간다. |
| `save` | 없음 | `1`이면 자동 실행이 끝난 뒤 개발 서버에 결과를 저장한다(`lab/results-inbox/`, git 제외). |
| `hud` | 없음 | `record`면 녹화용 HUD를 띄운다. |

예: `?engines=stack,fiber-slice,fiber&size=20000&runs=3&autorun=1&hud=record`

### 앱 구성

- 루트 `App`만 상태를 가진다: `query`, `matchQuery`, `slo`, `size`, `seed`, `selected`.
  - `useMemo`로 데이터 생성, 검색 매칭, 통계를 계산한다.
  - `useEffect`로 셀을 선택하면 `document.title`을 바꾼다.
- 자식은 props만 받는 순수 함수다: `SearchBar`, `Controls`, `Heatmap`/`Row`/`Cell`, `StatsPanel`, `DetailPanel`, `ClickCounter`.
- 검색 입력: `setQuery(v)` 후 `startTransition(() => setMatchQuery(v))`. stack에서는 우선순위가 없어 즉시 실행된다.
- 셀 클릭: `Heatmap` 컨테이너 하나의 `onClick`이 `event.target.dataset`으로 셀을 찾는다.
- 새 데이터 수신 버튼: 시드를 올려 데이터를 새로 만든다(대규모 업데이트).
- 실시간 수신 표시: 별개의 두 번째 루트 `ProgressApp`이 rAF마다 `setProgress`한다. CSS 애니메이션은 쓰지 않는다.

### 시나리오

| ID | 내용 | 주로 보는 지표 |
|----|------|----------------|
| S1 | 새 데이터 수신을 2초 간격으로 3회 | 렌더+커밋, 최장 Long Task, 끊긴 프레임 |
| S2 | 100ms 간격으로 `deploy-1742 err-503`(19글자) 입력 | 입력 지연, 키 입력당 렌더+커밋 |
| S3 | 새 데이터 수신 직후 200ms 간격으로 셀 클릭 10회 | 클릭 지연 |
| S4 | 5초 동안 새 데이터 수신을 연속 실행 | 실시간 수신 표시 fps, 끊긴 프레임 |

- 시나리오마다 엔진별로 **워밍업 1회를 먼저 돌리고 버린다.**
- 실행마다 히트맵 루트를 같은 props로 다시 마운트해서 같은 상태에서 시작한다.
- 엔진이 여럿이면 stack, fiber, stack, fiber … 순서로 번갈아 실행한다. 한 엔진을 몰아서 돌리면 그동안의 기기 상태 변화가 한쪽에만 실리기 때문이다.

결과 표는 페이지 아래 "측정" 패널에 나오고, "JSON 내려받기"로 실행별 원자료까지 받을 수 있다.

### 측정 환경 기록

- 각 실행(워밍업 포함) 직전에 rAF 간격 120개를 30개씩 나눠 구간별 중앙값 중 가장 작은 값으로 **화면 주사율을 추정**한다. 느린 프레임은 간격을 늘리기만 하므로 가장 조용한 구간이 실제 주사율에 가깝다. 프레임 예산은 고정 16.7ms가 아니라 `1000 / 추정 주사율`이다.
- **끊긴 프레임은 예산의 2배를 넘는 프레임이다.** 1ms 여유를 포함해 60Hz에서는 34.3ms, 120Hz에서는 17.7ms를 넘으면 끊김이다. 실행 중 관측 빈도가 달라져도, 판정 예산은 **각 실행 직전** rAF 추정값으로 고정하고, 타이머 반올림을 고려해 1ms 여유를 둔다(예산 × 2 + 1ms 초과가 끊김). 실행 중 중앙값(`refreshHzObserved`)은 진단값으로만 남기며 예산을 늘리지 않는다. 실행 전 추정과 실행 중 중앙값 또는 실행 중 조용한 구간과 중앙값이 3Hz 넘게 다르면 `refreshUnstable` 경고를 남긴다. 물리적인 화면 주사율 변화의 확정 증거는 아니다. HUD도 실행 전 예산을 쓴다.
- 주사율이 60Hz(±3)가 아니면 HUD와 결과 표에 경고(⚠)를 띄운다. 프레임 기준이 달라 60Hz 결과와 바로 비교할 수 없기 때문이다.
- 결과 JSON의 `environment`에 다음을 남긴다: 측정 시각, `userAgent`, 브라우저 버전, 추정 주사율, 전원 상태(Battery API가 있으면 충전 여부·잔량), 뷰포트, 코어 수. 워밍업 횟수(`warmupDiscarded`)도 함께 남긴다.

### 지표 정의

| 지표 | 정의 |
|------|------|
| 프레임 간격 | 측정 도구 자체 rAF 사이 간격. p50/p95/max, 끊긴 프레임(실행 전 예산 × 2 + 1ms 초과) 수 |
| Long Task | `PerformanceObserver('longtask')`로 잰 50ms 초과 작업의 수와 최장 시간. 지원하지 않는 브라우저는 "측정 불가" |
| **입력 지연 (메인)** | **예정 시각 기준.** 스크립트가 입력하려던 시각 → 그 값이 `#echo`에 반영된 커밋 이후 첫 rAF |
| 입력 지연 (보조) | 실제 발사 시각 기준. `input` 이벤트 `timeStamp` → 같은 끝점 |
| **클릭 지연 (메인)** | **예정 시각 기준.** 클릭하려던 시각 → 각 클릭의 예상 seq에 도달한 커밋 이후 첫 rAF. 한 커밋 이전에 들어온 여러 클릭을 첫 클릭 반영만으로 모두 완료 처리하지 않음 |
| 클릭 지연 (보조) | 실제 발사 시각 기준. `click` 이벤트 `timeStamp` → 같은 끝점 |
| 렌더+커밋 / 작업 구간 | 업데이트 1건당 경과 시간 / 실제 작업 구간 합계. Fiber의 양보 대기는 작업 시간에서 제외한다. OS CPU 시간은 아니다. stack Commit은 diff 포함, Fiber Render는 reconciliation 포함이므로 합계를 비교하며 첫 마운트는 제외 |
| 실행 전체 비용 / 처리량 | durationMs, activeTotalMs, 커밋 수·커밋/초, 수신 수. S4는 실행마다 수신·커밋 수가 달라 1건당 비용과 전체 비용을 구분 |
| JS / 렌더링 우세 긴 프레임 | LoAF 50ms 초과 프레임을 아래 규칙으로 분류한 수와 **해당 프레임 전체 duration 합계**. JS·렌더링 구간 시간 합계도 별도 제공. 미지원은 측정 불가 |
| 수신 표시 fps / 끊김 | 진행 바 루트의 초당 커밋 수 / 커밋 간격이 실행 전 예산 × 2 + 1ms를 넘은 횟수 |

지표 버전은 `B1.5-fixed-pre-run-loaf-v2`다. 긴 프레임/Task는 측정 창과 겹치면 전체 duration을 포함하고 원래 시각과 `windowOverlap` 표시를 보존한다. 따라서 경계 프레임의 합계에는 창 밖의 일부 시간이 포함될 수 있다. 실행별 JSON은 프레임 간격·진행 바 커밋·업데이트·LoAF·Long Task 원자료를 보존한다. B-1 JSON에는 간격 배열이 없으므로 소급 재계산하지 않고 B-2에서 세 엔진을 다시 측정한다.

LoAF의 `renderStart`는 rAF 콜백을 포함한 렌더링 시작, `styleAndLayoutStart`는 스타일·레이아웃 시작이다. 각 프레임에 전자 이전 구간, 두 경계 사이(rAF 등), 후자 이후 구간을 기록한다. `scriptMs = Σ(scripts.duration - forcedStyleAndLayoutDuration)`, `renderingMs = 프레임 끝 - styleAndLayoutStart + 강제 style/layout 시간`으로 나눠 큰 쪽을 우세 원인으로 분류한다(동률은 JS, 둘 다 0이면 미확인). 경계가 0이면 해당 렌더링 구간은 0으로 둔다. 분류별 시간은 프레임 전체 시간이며 별도 구간 합계와 혼동하지 않는다. `scripts`는 짧은 콜백이나 교차 출처 작업을 빠뜨릴 수 있고, renderingMs에도 렌더링 단계의 다른 콜백이 포함될 수 있다. **인과 확정이나 모든 JS의 정확한 CPU 시간으로 보지 않고 trace와 함께 확인한다.** [W3C LoAF 초안](https://w3c.github.io/long-animation-frames/)을 기준으로 기록한다.

**예정 시각 기준을 메인으로 삼는 이유:** 메인 스레드가 막혀 있는 동안 스크립트의 타이머는 실행되지 못하고 기다린다. 그 뒤에 만들어진 이벤트는 실제 발사 시각에 `timeStamp`가 찍히므로, 실제 발사 시각 기준에서는 막혀서 기다린 시간이 빠진다. 사람의 실제 입력은 하드웨어 시각이 찍혀 그 대기가 포함된다. 그래서 예정 시각 기준이 사람이 느끼는 지연에 더 가깝다. 사람이 직접 입력할 때는 예정 시각이 없으므로 메인 지표도 발사 시각 기준으로 잰다.

### 측정 도구를 엔진 밖에 둔 이유

측정 도구(`lab/metrics.js`, `runner.js`, `hud.js`)는 Vanilla DOM으로만 그린다. 엔진과는 계측 훅과 커밋 직후 DOM 읽기로만 닿는다.

- 측정 도구를 엔진으로 그리면 그 렌더링 비용이 측정 대상에 섞인다.
- 엔진이 메인 스레드를 막으면 측정 도구도 같이 멈춰서, 멈춘 사실을 기록하지 못한다.
- 앱 상태가 아니라 화면에 실제로 반영된 것을 기준으로 재야 엔진을 바꿔도 같은 기준으로 비교할 수 있다.

### 녹화

README용 녹화는 **1280×720 창**에서 `?hud=record`로 한다. HUD는 이 크기에서 숫자가 잘리지 않게 한 줄로 배치했다(엔진·시나리오·주사율 | 프레임 그래프 | 최장 Long Task·입력 지연 p95·수신 표시 fps).

### B-3 추가 진단 지표

기존 고정 예산·LoAF·총 지연 정의는 유지한다. S2/S3은 예정 시각→실제 이벤트 실행→처리 렌더 시작→커밋→다음 rAF의 각 구간 p95를 추가한다. fiber에서는 Sync 렌더를 연결하며, 다른 엔진은 입력을 처리한 렌더를 연결한다. 각 구간의 p95 합은 전체 지연 p95와 같을 필요가 없다. Sync Render 작업 시간은 DOM Commit을 제외한 루트 실행·전체 재조정 비용이다. 폐기 Transition 수·작업 시간은 커밋된 작업 비용과 따로 기록하고 allActiveTotalMs에는 둘을 합친다. 마지막 입력/클릭 발사 직후부터 최종 heatmap idle Commit 다음 rAF까지를 heatmapSettleMs로 기록한다. 이것은 실제 물리적 paint 완료의 근사치다.

### B-4 경계 생략과 카운터

`?engines=stack,fiber,fiber-bailout&apps=current,cached&size=20000&runs=3&autorun=1`로 같은 빌드에서 6개 조합을 비교한다. 조합마다 워밍업 1회를 버리고, 실행마다 current/stack → current/fiber → current/fiber-bailout → cached/stack → cached/fiber → cached/fiber-bailout 순서로 돈다. `current`는 새 두 useMemo에 deps를 주지 않아 매번 새 함수·VNode를 만들고, `cached`는 승인된 의존성을 쓴다. Hook 개수는 고정이다. current도 두 Hook 슬롯의 작은 추가 비용이 있어 과거 B-3 원본과 바이트 단위 동일한 대조군은 아니다.

fiber-bailout은 같은 host 부모·확장 경로·출력 인덱스의 VComponent 객체가 동일하고 단일 host를 반환할 때만 생략한다. 자식은 순수 함수여야 하며 중첩 데이터를 제자리 수정한 같은 VNode는 이전 화면을 유지한다. 새 VNode를 전달하면 갱신된다. 행 캐시·key 매칭·prop별 얕은 비교는 없다.

측정 JSON은 heatmap 루트의 각 Commit과 폐기 attempt의 `counters`를 보존한다. 별도 ProgressApp 루트는 fps로 기록한다. `counterTotals`/`counterSync`/`counterAborted`는 각각 커밋 합계/Sync 합계/폐기 합계이며 total=inside+outside다. stack은 계측 금지 범위를 유지하므로 카운터는 null(N/A)이다. 수치는 합계이며 시간 평균과 섞지 않는다.

- rootCalls/childCalls: 루트/순수 자식 호출. Heatmap 함수 자체는 inside, 그 host 경계 헤더는 outside, 하위 자손은 inside다.
- renderFiberVisits: beginWork 또는 재사용 헤더 진입 수. renderWorkUnits는 단계 반복 수다.
- commitFiberVisits = commitEffectVisits + commitAnchorSiblingVisits. commitHookVisits는 루트 Hook 큐 반영·레인 재계산 순회다.
- liveDomWrites는 엔진의 연결 DOM API 호출 수(폼 property 쓰기 포함), detachedDomOps는 새 노드 생성·속성·자식 조립, eventHandlerWrites는 핸들러 표 갱신이다. 외부 입력 주입과 브라우저 layout/paint는 제외한다.
- bailoutHits/Misses와 미스 이유(different VComponent / different position / fallback shape)를 기록한다. 초기 등록도 miss이며 측정 창 밖 마운트는 요약에서 제외한다. 같은 객체를 다른 host 부모로 옮기면 그 부모에는 기록이 없으므로 different VComponent(이전 경계 없음)로 집계한다.

지표 시간 정의는 B-3과 같다. 경계 캐시·카운터 계측 비용을 포함한 이번 세션 안에서 비교하며 과거 B-3 숫자와 직접 성능비를 만들지 않는다.

B-4 실측과 앱 변경 diff 전문은 [B-4 보고서](docs/codex/B4-fiber-bailout.md)에 있다. 보존된 원자료의 모든 카운터와 불변식은 `node lab/dev/summarize-bailout.mjs docs/results/fiber-bailout-b4/fiber-bailout-cross.json docs/results/fiber-bailout-b4`로 재집계할 수 있다.

B-4 승인 후 최종 attempt 시간 분해·프로덕션 카운터 ON/OFF·객체 생성 위치·기존 경고 확인은 [B-4 진단 보고서](docs/codex/B4-diagnosis.md)에 기록했다. 엔진·앱 원본 변경 없이 계측만 추가했으며, 분석은 `node lab/dev/analyze-b4-diagnostics.mjs docs/results/fiber-b4-diagnostics`로 압축 원자료에서 재현한다.
