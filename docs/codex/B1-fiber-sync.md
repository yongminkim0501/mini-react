# B-1 · fiber-sync 구현과 교차 측정

2026-11-10 · 기준 `baseline-stack` (`ef08734`) · 측정 코드 `8603179`

## 구현 범위

`feat/fiber-engine`의 별도 worktree(`/private/tmp/mini-react-fiber-engine`)에 `fiber-sync`를 추가했다. 순수 자식 함수의 반환값을 반복 확장하고, 펼쳐진 host 자식을 stack과 같은 인덱스로 비교한다. key 매칭·bailout·새 memo 최적화는 없다. 기존 `h()`와 VNode 형식, 루트에서만 Hooks를 사용하는 앱을 그대로 재사용한다.

| 파일 | 변경 내용 |
| --- | --- |
| `src/fiber/types.ts`, `workLoop.ts` | Fiber 필드, begin/complete와 반복 단위 작업, 투명 자식 확장, host 인덱스 비교, alternate 두 버퍼 |
| `src/fiber/root.ts`, `hooks.ts` | microtask 배칭, Hook별 action 큐, Render 실패 시 current·큐 보존, useMemo 호환, passive effect 수명 |
| `src/fiber/dom.ts`, `commit.ts` | 독립 이벤트 표, detached DOM 구성, 삭제→삽입→속성/텍스트→current 교체 |
| `src/fiber/index.ts`, `lab/engine-adapter.js` | 앱 팩터리 연결, `fiber-sync` 모드 공개, 루트별 계측 구독 |
| `lab/app/heatmap-app.js` | 승인한 onRegenerate의 startTransition 한 줄 |
| `lab/metrics.js`, `lab/runner.js` | 실패·다른 attempt의 이벤트 제외, activeMean 추가, 단계별 구간 표기 |
| `src/fiber/fiber.test.ts`, `lab/fiber-differential.test.js` | 아래 정확성 검증 |
| `lab/dev/measure-fiber-sync.mjs`, `summarize-fiber-traces.mjs` | 외부 패키지 없는 Chrome CDP 측정·trace 저장과 집계 |

Render에서는 재사용하는 DOM·속성·이벤트 표를 변경하지 않는다. 새 노드는 detached 상태에서 구성한다. updater 함수는 setter 호출 시 실행하지 않고 Render에서 재생하며, Commit이 성공한 때만 큐에서 소비한다. 한 이벤트의 연속 setState는 microtask 한 번에 처리한다. Commit은 동기 실행한다.

effect는 rAF 뒤 task로 예약해 paint 기회를 준다. 실제 물리적 paint 완료를 보장하는 API는 아니다. 테스트용 passive drain과 정상 예약 경로를 구분해 검증했다. cleanup·effect 오류는 다른 effect를 막지 않으며, unmount는 미실행 작업과 이전 setter를 무효화한다. 의존성 없는 effect의 연속 갱신은 100회에서 중단한다.

## 승인과 수정 금지 파일

B-0 완료 보고의 세 가지 승인 요청에 사용자가 `ㄱㄱ`로 승인했다. 그 근거로 앱의 `onRegenerate`만 startTransition으로 감쌌고, 기존 useMemo를 호환 구현했으며, Render+Commit 합계 중심 비교를 적용했다(B11).

`src/core/**`, `src/runtime/**`, `lab/data.js`는 기준 태그와 동일하다. 앱 파일의 diff는 승인한 한 줄뿐이다. 기존 stack 팩터리의 구현은 유지했다. 결정은 [B11~B15](../decisions.md)에 기록했다.

## 정확성 검증

- host DOM 비교: 여러 루트 형식, 인접 텍스트 병합, 배열·null 반환, 다른 순수 함수가 반환하는 같은 host의 노드 재사용, 인덱스 교체·삭제·추가, key 전파, SVG/foreignObject.
- 이벤트·폼: 최신 핸들러 교체/삭제/재등록과 중복 호출 방지, this 바인딩, dirty input value와 선택 범위 유지.
- Render/Commit: 미커밋 작업은 현재 DOM·핸들러·Hook 상태를 바꾸지 않음, alternate 두 버퍼 재사용, 실패한 Render의 action 보존과 재시도, 계측 순서.
- Hooks: 기존 stack 테스트를 유지하고 공통 행동을 두 엔진에 실행. lazy 초기화, 안정적인 setter, 값/함수 action, 배칭, 같은 값, memo 의존성, effect 의존성·cleanup·오류 격리·상태 갱신, 순서/개수/자식/렌더 중 Hook 오용, 루트 격리와 해제.
- passive 예약: 가짜 시계로 rAF→task, 미실행 effect 취소, 재마운트 이전 setter 무효화, 무한 갱신 제한, 함수 중첩 제한.
- 히트맵: 동일 seed에서 새 데이터·검색·선택·SLO·크기 변경·연속 수신의 DOM과 document.title을 stack/fiber-sync 사이에 비교(1k→2k fixture). 실브라우저 성능 비교는 20k로 실행.

기존 테스트 파일을 수정하지 않았다. stack의 동기 effect 단언이나 내부 hooks 배열 모양을 Fiber에 억지로 맞추지 않고, Fiber 행동 테스트는 passive drain을 명시한다.

| 명령 | 실제 결과 |
| --- | --- |
| `npm run test:run` | 27개 파일, 310개 테스트 통과 |
| `npm run typecheck` (`tsc --noEmit`) | 종료 코드 0 |
| `npm run build` | 타입 검사·Vite 빌드 통과, 종료 코드 0 |
| `git diff --check` | 통과 |

## 교차 측정

측정 원자료와 환경 표는 아래 최종 결과 절에 있다. `?engines=stack,fiber-sync&size=20000&seed=42&cellCost=0&runs=3&autorun=1`로 각 시나리오마다 엔진별 워밍업 1회를 버리고 stack→fiber-sync 순으로 3회 교차 실행했다. 과거 stack 기준선과 비교하지 않고 승인한 앱 한 줄을 양쪽에 동일하게 적용해 새로 측정했다.

표의 Render+Commit은 실행별 평균의 3회 평균이다. 최장 Long Task는 세 실행 전체의 최댓값을 표시하고, 기존 집계의 실행별 최댓값 평균도 원자료에 보존한다. p95는 각 실행의 예정 시각 기준 p95를 3회 평균했다. 프레임 수와 fps도 실행별 평균이다. 해당 없는 지연은 N/A다.

stack Render는 root 함수+resolve, Commit은 diff+DOM 반영이다. Fiber Render는 reconciliation까지 포함하고 Commit은 DOM 반영이다. 단계별 수치를 그대로 우열 비교하지 않는다. B-1은 양보가 없어 작업 구간 합계(activeMean)가 전체 경과 시간과 거의 같다. 이는 작업 구간의 경과 시간이며 OS CPU 계측이 아니다.

### 최종 결과와 환경

원자료: [교차 측정 JSON](../results/fiber-sync-b1/fiber-sync-cross.json). 코드 커밋은 `8603179e0a37b389a2266789490fac35f608e3d7`이고 측정 시작 시 작업 트리는 깨끗했다. 아래 숫자는 이 최종 실행에서만 가져왔다. 안전장치 보완 전의 예비 측정은 합치지 않았다.

| 환경 | 값 |
| --- | --- |
| 브라우저 | Chromium 153.0.8010.12, Not_A Brand 8.0.0.0 |
| 전원 | 충전 중, 100% |
| viewport / DPR | 1280x720 / 2 |
| 논리 코어 | 10 |
| 실행 | headed Chrome, CPU throttling 1배, Vite 개발 서버 |
| 시나리오 시작 시각 (UTC) | 2026-11-10T04:12:09.399Z ~ 2026-11-10T04:14:10.241Z |
| 실행 전 rAF 추정 Hz | 60/60/60/60 |

| 시나리오 | 엔진 | Render+Commit 평균 ms | 작업 구간 합계 평균 ms | 최장 Long Task ms (전체 max) | 예정 기준 지연 p95 ms | 끊긴 프레임 | 진행 바 fps | 실행 중 Hz (3회) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | stack | 104.3 | 104.3 | 108.0 | N/A | 3.0 | 55.6 | 60/60/60 |
| S1 | fiber-sync | 91.4 | 91.4 | 96.0 | N/A | 3.0 | 55.9 | 60/60/60 |
| S2 | stack | 66.4 | 66.4 | 93.0 | 143.2 | 19.0 | 30.1 | 60/60/60 |
| S2 | fiber-sync | 59.7 | 59.7 | 87.0 | 129.0 | 19.0 | 33.7 | 60/60/60 |
| S3 | stack | 66.6 | 66.6 | 113.0 | 189.6 | 11.0 | 43.6 | 60/60/60 |
| S3 | fiber-sync | 60.4 | 60.4 | 92.0 | 166.7 | 11.0 | 44.3 | 60/60/60 |
| S4 | stack | 103.4 | 103.4 | 126.0 | N/A | 29.0 | 10.6 | 60/47/60 |
| S4 | fiber-sync | 89.2 | 89.2 | 113.0 | N/A | 1.7 | 11.2 | 12/12/11 |

### 해석

- Render+Commit 평균은 Fiber가 S1 12.3%, S2 10.2%, S3 9.4%, S4 13.7% 짧았다. 두 엔진은 여전히 같은 수십~100ms 범위이며, 동기 Fiber만으로 입력 지연이나 Long Task가 없어지지 않았다. S2 입력 p95는 143.2→129.0ms, S3 클릭 p95는 189.6→166.7ms였다. 시간 분할·레인 효과를 입증하는 결과가 아니다.
- 소스 구조상 차이의 후보는 stack의 resolve 결과 재구성·별도 diff·경로 해석과 Fiber의 직접 DOM 참조·통합 reconciliation이다. 이는 코드에 근거한 추론이며, 단일 trace만으로 각 비용의 인과 기여도를 확정하지 않는다. Fiber의 Commit만 작은 것을 전체 작업 감소로 해석하면 안 된다. 예를 들어 S2의 Render/Commit 평균은 stack 45.4/21.0ms, Fiber 58.5/1.2ms다.
- **S4의 끊긴 프레임 29.0→1.7을 개선으로 해석할 수 없다.** 기존 판정식이 실행 중 rAF 간격 중앙값으로 예산을 늘리므로, Fiber가 관측 11~12Hz에 머문 실행에서는 긴 프레임도 덜 세어진다. Fiber 세 실행 모두 refreshUnstable=1이고 stack도 한 실행이 1이다. 이는 물리적 디스플레이 Hz의 직접 측정값이 아니다. 진행 바 fps는 10.6→11.2로 둘 다 낮았고, 양보 없는 S4의 멈춤은 남았다. 기존 지표 정의는 이번 관문에서 바꾸지 않았다.
- S4는 5초 내 가능한 만큼 수신하므로 stack 평균 29회, Fiber 평균 31회 업데이트로 작업량도 다르다. 같은 크기의 업데이트 한 건 비용과 실행 전체의 처리량을 구분해야 한다. S2는 양쪽 모두 매 실행 19개 입력·19개 커밋, S3는 10개 클릭·11개 커밋을 기록했다.
- patchMean은 실제 작업 종류의 집계다. stack의 REPLACE 1건은 Fiber에서는 삭제+삽입 2건으로 셀 수 있어 두 수치를 그대로 동일한 단위로 비교하지 않는다. 별도 최적화나 작업 생략으로 속도를 맞추지 않았다.
- 표본은 조건당 3회다. 보편적인 성능 우위나 동등성을 통계적으로 확정하지 않는다. 원래 목표였던 공정한 비교는 앱·입력·환경을 맞추되 단계 분해, effect 시점과 내부 구조의 차이를 함께 공개하는 수준으로 성립한다.

## Chrome Performance trace

교차 측정과 별도로 양쪽 엔진에서 20k S2의 첫 글자 `d` 입력 한 건을 Chrome CDP Tracing으로 녹화했다. 두 번의 사전 입력으로 워밍업하고 검색어를 비운 뒤 기록했다. start 마커 직후 실제 키 이벤트를 보내고 두 rAF 뒤 end 마커로 구간을 닫았다. 진행 바를 포함한 동일 페이지의 주 스레드 비용이며 히트맵만의 CPU 프로파일은 아니다.

첨부 `.trace.json.gz`는 DevTools Performance에 불러올 수 있는 원본이다. 비율은 `summarize-fiber-traces.mjs`가 마커 사이 주 스레드 이벤트의 중복 구간을 제거해 계산했다. Scripting은 FunctionCall/EventDispatch/RunMicrotasks 등의 합집합, Rendering은 Layout/UpdateLayoutTree/PrePaint/Layerize 등의 합집합, Painting은 Paint/Commit 등의 합집합이다. 겹칠 때 Painting→Rendering→Scripting 순으로 한 범주에만 귀속한다. 나머지는 Other/Idle이다. 정확한 이벤트 목록과 정의는 trace-summary.json에 있다.

**이 표는 trace에서 재현 계산한 값이며 DevTools UI의 Summary 숫자를 읽은 값은 아니다.** marker 구간에는 CDP 명령 간격과 프레임 대기가 포함된다. 비율의 분모는 그 전체 구간이고 Scripting+Rendering+Painting만을 분모로 삼지 않는다. 단일 입력 기록의 수치를 반복 측정의 대표값으로 일반화하지 않는다.


원본: [stack trace](../results/fiber-sync-b1/stack-20k-S2-key.trace.json.gz), [Fiber trace](../results/fiber-sync-b1/fiber-sync-20k-S2-key.trace.json.gz), [trace 집계·범주 정의](../results/fiber-sync-b1/trace-summary.json), [trace 환경](../results/fiber-sync-b1/trace-info.json). 두 기록 모두 echo가 `d`로 반영된 것을 확인했다.

| 엔진 | 선택 구간 ms | Scripting ms (%) | Rendering ms (%) | Painting ms (%) | Other/Idle ms (%) |
| --- | --- | --- | --- | --- | --- |
| stack | 218.4 | 97.3 (44.5%) | 65.8 (30.1%) | 51.1 (23.4%) | 4.2 (1.9%) |
| fiber-sync | 201.3 | 77.7 (38.6%) | 68.5 (34.0%) | 51.6 (25.6%) | 3.5 (1.8%) |

Fiber에서도 Rendering/Painting이 합쳐 약 120ms 남는다. 스케줄러를 추가해도 브라우저의 이 비용이 사라진다고 기대하면 안 된다. 두 엔진의 전체 입력 구간은 각각 218.4/201.3ms였고, 이는 교차 측정 p95와 다른 단일 입력·추적 조건의 값이다.

## 재현

1. 이 worktree에서 `npm ci`, `npm run dev -- --host 127.0.0.1 --port 5181`을 실행한다.
2. 별도 프로필의 headed Chrome을 `--remote-debugging-port=9331`로 실행한다. 전원·주사율을 기록하고 측정 탭을 전면에 둔다.
3. `node lab/dev/measure-fiber-sync.mjs /private/tmp/fiber-b1-final`을 실행한다. 코드 커밋과 작업 트리 상태도 원자료에 기록된다.
4. `node lab/dev/summarize-fiber-traces.mjs /private/tmp/fiber-b1-final`로 trace 표를 계산한다.

외부 라이브러리나 새 패키지를 추가하지 않았다. 브라우저의 CPU throttling은 1배이며 화면 주사율/전원 설정은 변경하지 않았다.

## 정지 지점

B-1 결과를 보고하고 멈춘다. B-2의 MessageChannel·5ms 양보·다중 루트 순환과 B-3의 레인·선점·재시작은 승인 후 다음 관문에서 진행한다. 푸시와 PR은 하지 않았다.
