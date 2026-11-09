# PR 초안: AX 에이전트 협업 v0.1 셋업

3명이 1~2주 동안 협업하는 기본안을 우선 1명·하루 범위에서 점검할 수 있도록 유형별 이슈 기록, 변경 영역, PR 검증 증거와 에이전트 절차를 고정한다. 라벨·마일스톤 생성이나 원격 워크플로 활성화는 실행하지 않았다.

관련 이슈: 셋업 이슈 번호 미정. 사람이 등록·배정한 뒤 `Refs #번호`로 연결한다.

## 변경 내용

- [도입안 적용본](ax-plan.md)과 [프로젝트 메타데이터](ax-project.yml)
- 라벨 생성 스크립트, Issue Forms 5종, PR 템플릿
- 8개 영역 지도와 동일 경로의 actions/labeler 설정·워크플로
- AGENTS.md 공통 규칙, 이를 불러오는 CLAUDE.md
- skill 원본 4종과 Claude Code·Codex용 복사 스크립트
- 읽기 전용 지표 스크립트와 오프라인 계산 테스트

## 영역 분할 근거

| 영역 | 경계와 이유 |
|---|---|
| html-to-vnode | HTML·DOM 파싱, 정리·필터, 해당 모듈의 VNode 모델을 같은 검토 범위로 유지 |
| vnode-to-dom | DOM 생성·마운트와 네임스페이스 처리 |
| vnode-to-html | 직렬화·이스케이프·왕복 규칙 |
| diff | 트리·속성 비교와 Patch 모델 |
| patch | DOM 대상 해석과 Patch 적용·폼 상태 동기화 |
| state | 스냅샷·뒤로가기·앞으로가기 |
| app | 페이지 컨트롤러·뷰·로그, 진입점·HTML·CSS |
| shared | 도구·의존성·설정·공통 테스트 환경·문서·AX 협업 파일. 변경 시 전원 알림 |

현재 모든 파일은 정확히 하나의 영역에 대응한다. 모듈이 소유한 타입 파일은 해당 모듈에 유지하며 다른 모듈에 미치는 파급 범위는 본문에 적는다. 사용자 결정에 따라 모든 영역의 임시 담당자를 @yongminkim0501 한 명으로 지정했다. 팀 확장 시 영역별로 재배정한다.

## 완료 조건별 검증

검증 대상: 기준 커밋 `c64630b`에 이 셋업의 미커밋 변경을 더한 로컬 작업 트리. 원격 PR 본문에 최종 검증 대상 커밋 SHA를 기록한다.

| 조건 | 명령·확인 방법 | 결과 |
|---|---|---|
| 앱 동작 회귀 검사 | `npm run test:run` | 13개 파일, 168개 테스트 통과 |
| 타입 검사·번들 빌드 | `npm run build` | 통과 |
| 지표 계산과 결측 처리 | `PYTHONDONTWRITEBYTECODE=1 python3 scripts/ax/test_metrics.py` | 6개 통과: 최초 ready·열린 경과 시간·결측·PR 제외·재오픈·수집 실패 |
| shell 구문 | `bash -n scripts/ax/create-labels.sh scripts/ax/sync-skills.sh` | 통과 |
| 라벨 명령 출력 | `bash scripts/ax/create-labels.sh yongminkim0501/mini-react` | 24개 라벨 명령 출력, 원격 호출 없음 |
| YAML·필수 항목 | 로컬 YAML 파싱 및 5종 필수 필드 점검 | 통과 |
| 영역 지도·labeler | 전체 파일의 영역 대응과 설정 경로 비교 | 누락·중복 없음, 경로 일치 |
| skill 형식 | skill-creator의 `quick_validate.py`로 4종 검사 | 통과 |
| skill 복사 | 격리 임시 저장소에서 복사·재실행·누락/변조 감지 | 통과. 실제 저장소의 도구별 폴더에는 아직 설치하지 않음 |
| 공백 오류 | `git diff --check` | 통과 |
| 원격 폼·자동 라벨 | 실제 GitHub 실행 | 미실행. 사람 검토·반영 후 확인 필요 |

## 가정 및 확인할 사항

1. 이 셋업은 요청받은 `feat/agent-ax-issue-ym` 브랜치에서 진행한다. 운영 이슈의 기본 브랜치 규칙은 이후 적용한다.
2. 사용자 결정에 따라 PR은 두 개로 분리한다. mini-react 구현 PR은 `feat/virtual-dom-vnode` → `develop`으로 기존 구현 커밋 22개를 다룬다. AX 셋업 PR은 `feat/agent-ax-issue-ym` → `feat/virtual-dom-vnode`를 기준으로 셋업 변경만 표시한다. 구현 PR 병합 후에는 AX PR의 기준을 `develop`으로 바꾸고 diff를 다시 확인한다. 원격 PR은 아직 생성하지 않았다.
3. 사용자 확정 범위는 AX 협업 셋업·운영 검증이며 시작일·마감일은 모두 2026-11-09(한국 시간)이다. 마일스톤 제목은 범위와 날짜를 조합한 `AX 협업 셋업·운영 검증 (11/9)`로 둔다. 작성·진행·운영 검증과 모든 영역 담당자는 @yongminkim0501 한 명으로 확정했다. 리뷰어는 미정이며 자기 PR 승인·병합을 에이전트가 대신하지 않는다. 동기화·최종 확인 시각, 에이전트 수·비용 방식은 미정으로 둔다. 3·6·9일차 체크포인트는 당일 일정에 포함되지 않는다.
4. 원본 skills는 `skills/`에 두고 `.claude/skills/`, `.agents/skills/`로 복사한다. 생성물은 git에서 제외한다. 실행은 `bash scripts/ax/sync-skills.sh`, 확인은 같은 명령에 `--check`를 붙인다. 복사 전에도 AGENTS.md 링크로 원본을 읽을 수 있다. Codex 경로는 [OpenAI 공식 문서](https://learn.chatgpt.com/docs/build-skills)를 기준으로 했다.
5. 폼은 유형 라벨만 자동 부착한다. 영역·심각도 입력값에 따른 라벨 변경은 지원하지 않으므로 등록 에이전트가 붙이고 동기화에서 확인한다. CLI 등록은 폼 필수 항목 검증을 우회하므로 skill이 동일 항목을 확인한다. risk:accepted는 자동 부착하지 않는다. 부채에는 이관을 위해 재검토 담당자 항목도 추가했다.
6. 담당자가 있는 열린 동일 영역 이슈를 진행 중일 수 있는 작업으로 취급한다. 겹침 여부는 사람이 판단한다. 상태 동기화 봇이나 새 상태 라벨을 추가하지 않았다.
7. 기존 `risk_issue/` 기록은 보존한다. 이번에 원격 이슈로 자동 이관하거나 사본 동기화하지 않는다. 새 기록은 GitHub에만 등록하고 기존 목록을 이관할 범위는 사람이 정한다.
8. 라벨 스크립트 기본 동작은 명령 출력이다. `--apply`로만 생성한다. 기존 라벨을 강제로 덮어쓰지 않으며 중복이면 중단한다. 일부 생성 후 중단되었다면 사람이 기존 목록을 확인하고 남은 명령만 실행한다.
9. labeler는 공식 `actions/labeler@v6`을 사용한다. [공식 설정](https://github.com/actions/labeler)에 따라 `pull_request_target`에서 동작하며 PR 코드를 checkout·실행하지 않는다. `sync-labels`는 설정된 영역 라벨만 동기화한다. owner 멘션은 에이전트가 기록하며 자동 멘션 봇은 추가하지 않는다.
10. 지표 스크립트는 Python 3 표준 라이브러리와 로그인된 `gh`를 사용한다. M2·M3·M4와 확인 가능한 재오픈 일부를 수집한다. M1 최초 본문, M6 같은 문제 재등록, M7 사례, M8 비용은 근거가 없으면 N/A다. 최초 본문 수집 자동화를 추가하지 않았으므로 M1의 완전한 자동 측정은 이번 셋업에서 제공하지 않는다. M5는 N/A다. null은 보고서에 N/A로 옮긴다.
11. 현재 라벨·상태·마일스톤 소속을 읽으므로 보고 시점에 실행한다. 이관 전에 지표를 수집하고 이관 목록과 대조해야 한다. 이 스크립트만으로 과거 스냅샷·삭제된 기록·인과·검증 증거를 복원하거나 보증하지 않는다.
12. 도입안은 원문의 14장 구조와 운영 기준을 정리한 적용본이며 원문 그대로의 전사본은 아니다. 원 기획서 원문은 제공되지 않아 별도 생성하지 않았다.

## 사람이 검토·병합 후 실행할 원격 명령

아래는 실행 기록이 아닌 명령 초안이다. 마일스톤 값은 실제 결정값을 넣는다.

```sh
# 먼저 출력할 명령을 검토한다.
bash scripts/ax/create-labels.sh yongminkim0501/mini-react
# 기존 라벨과 충돌 여부를 확인한 뒤 사람이 실행한다.
bash scripts/ax/create-labels.sh --apply yongminkim0501/mini-react

# 사람이 확정한 값이 없으면 실행하지 않는다.
: "${AX_MILESTONE_TITLE:?마일스톤 이름을 입력하세요}"
: "${AX_MILESTONE_DUE:?마감일을 UTC ISO 8601로 입력하세요}"
: "${AX_MILESTONE_SCOPE:?범위 한 줄 설명을 입력하세요}"
gh api --method POST repos/yongminkim0501/mini-react/milestones \
  -f title="$AX_MILESTONE_TITLE" \
  -f due_on="$AX_MILESTONE_DUE" \
  -f description="$AX_MILESTONE_SCOPE"
```

생성된 번호와 결정값을 `docs/ax-project.yml`에 기록한다. 이후 폼·PR에 같은 마일스톤을 넣고 labeler가 실제 변경 영역을 붙이는지 확인한다. ready를 메인테이너만 붙인다는 규칙, 교차 승인·사람 병합·종료는 이 셋업에서 강제 봇을 만들지 않고 사람이 운영한다.
