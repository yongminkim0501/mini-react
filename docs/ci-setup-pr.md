# CI 셋업 PR 검토 자료

> 현재 배포 구조: AX는 앱 구현과 분리되어 `tools/ax/`의 전용 패키지로 검사한다. `npm ci --prefix tools/ax && npm run check --prefix tools/ax`를 사용한다. 아래의 앱 패키지·Vitest 측정값과 브랜치 구성은 이전 PR 작성 당시 기록이며 현재 AX의 의존성이 아니다. 앱 CI는 Phase 1 검토·도입 시 별도 구성한다. 자세한 복구 순서는 [AX 분리 문서](ax-isolation.md)를 따른다.

## 저장소 조사

- 언어: TypeScript 7.0.2, ES modules. 테스트·개발 도구는 Vite 8, Vitest 5, jsdom 31.
- 패키지 매니저: npm, package-lock.json 사용.
- 기존 린트: 없음. 기존 검사: npm run test:run(Vitest), npm run typecheck, npm run build.
- 기존 CI: GitHub Actions workflow 목록에 CI 없음. AX의 labeler·입력 자동화는 별개 기능으로 검사 CI를 대체하지 않음.
- 기본 브랜치: main. 개발 PR 다수는 develop을 대상으로 하므로 CI PR 이벤트는 대상 브랜치를 제한하지 않음.
- 기존 AX 지표에는 Python 표준 라이브러리 테스트 6개가 있어 단위 테스트 진입점에서 함께 실행.

## 린트 도입 방식 제안

Oxlint 1.92.0의 기본 correctness 96개 규칙을 error로 설정하고 경고도 실패 처리한다. 추가 포맷팅·스타일·타입 검사 규칙은 이번에 켜지 않는다. TypeScript 런타임에 의존하지 않아 현재 TypeScript 7과 typescript-eslint의 peer dependency 범위 충돌을 피한다.

| 측정 대상 | 파일 수 | 위반 수 |
|---|---:|---:|
| 이 셋업 기준 Phase 1, c64630b | 44 | 0 |
| 별도 진행 중 Phase 2 브랜치, 6a37b4c | 75 | 3 |

Phase 2의 3건은 src/runtime/h.test.ts의 사용하지 않는 `_` 매개변수 2건, 상수 논리식 1건이다. 사용자 개발 트리와 테스트는 수정하지 않았다.

변경 파일만 검사하면 기존 3건을 남긴 채 시작할 수 있으나 전체 검사와 결과가 달라진다. Oxlint의 네이티브 기준선 기능은 이번에 도입하지 않는다. 기준 코드의 위반이 0이고 별도 브랜치도 3건뿐이어서 **전체 검사**를 제안한다. Phase 2 위반은 별도 부채 이슈에서 해결한다. 기준선·ignore·규칙 끄기로 숨기지 않았다.

## 변경 동작

- npm run lint: 전체 JS/TS correctness 검사, 경고·오류 시 실패.
- npm test: 기존 Vitest 모음 → 존재하는 AX Node 테스트 → 기존 Python 지표 테스트. 실패하면 즉시 비정상 종료.
- npm run check: 동일한 lint·test를 차례로 실행.
- npm run test:run은 npm test의 호환 별칭. 개발용 watch는 npm run test:watch.
- PR 및 main push의 lint·test job. 읽기 전용, 캐시, 시간 제한, 이전 실행 취소, 경로 필터 없음.
- CODEOWNERS의 담당자는 요청대로 비움. 지정 전 보호 효과 없음.
- AGENTS.md와 ax-submit-pr에 CI 무결성 규칙 반영.

## 가정

1. Node 24 계열을 .nvmrc로 선택. jsdom 31의 최소 조건을 반영해 engines는 >=24.15.0. 기존 로컬 Node 26도 허용.
2. correctness 중심 Oxlint를 초기 도구로 선택했고 전체 검사를 제안. 도구와 도입 방식은 사람이 최종 승인한다.
3. 기존 Vitest suite를 그대로 실행한다. 이름에 integration이 포함된 기존 파일도 제거하지 않으며 별도 서비스 통합·E2E 환경은 추가하지 않는다.
4. 기존 AX Python 테스트에는 추가 Python 패키지가 필요 없고 ubuntu-latest의 python3를 사용한다.
5. CI만 별도 PR이며 AX 입력 자동화 PR과 AGENTS.md가 겹칠 수 있다. 병합 시 두 규칙 모두 보존한다. Node AX 단위 테스트는 파일이 반영되면 같은 test 진입점에서 자동 발견한다.
6. 기본 브랜치 병합 전까지 main push 검증과 보호 규칙 검증은 완료로 표시하지 않는다.

## 관리자가 설정할 Rulesets 항목 — 실행하지 않음

대상: main. develop도 병합 관문으로 보호할지는 사람이 별도 결정한다.

- 필수 상태 검사: lint, test
- PR 필수, 작성자 외 승인 1건
- 새 커밋 push 시 기존 승인 취소
- Code Owners 리뷰 필수
- force push·브랜치 삭제 차단
- 최신 기본 브랜치 반영 요구: 처음에는 끔
- CODEOWNERS 각 패턴에 실제 사람/팀 계정 지정

현재 참여자가 1명이므로 승인 1건·Code Owner 교차 리뷰를 강제하면 다른 적격 리뷰어가 필요하다. 이 제한을 우회하도록 Rulesets를 만들지 않는다.

## 검증 상태

실제 결과는 원격 PR 본문에 최종 커밋과 함께 기록한다. 로컬 통과·의도적 실패의 종료 코드와 실제 GitHub 실행을 구분한다. 병합 차단·승인 취소·Code Owner 요청·기본 브랜치 push 검증은 관리자 설정·병합 후 사람 확인이 필요하다.

### 로컬 확인 결과

- `npm ci && npm run check`: 통과. Vitest 13개 파일·168개, Python 지표 테스트 6개.
- 격리 fixture에 실제 린트 위반을 넣고 `npm run check`: 비정상 종료, 테스트 단계 전에 중단.
- 격리 fixture에 실패하는 단언을 넣고 같은 명령 실행: 비정상 종료.
- fixture의 린트·테스트가 정상일 때 같은 명령: 정상 종료.
- CI YAML의 이벤트·권한·캐시·작업 이름·시간 제한·경로 필터 부재, package-lock 일치, 비어 있는 CODEOWNERS 검사 통과.
- ax-submit-pr skill 형식 검사와 git diff --check 통과.
- 기존 Phase 2 위반은 [부채 이슈 #23](https://github.com/yongminkim0501/mini-react/issues/23)으로 등록. ready·담당 배정은 하지 않음.
- Rulesets·브랜치 보호·승인·Code Owner·main push의 실제 병합 차단 시나리오는 미검증.
