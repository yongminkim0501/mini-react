# AX와 애플리케이션 PR 분리

AX는 협업 운영 도구다. mini-react의 Virtual DOM·Diff·Patch·History 구현이나 앱 테스트를 선행 병합할 필요가 없다.

## 발생한 문제

AX 브랜치를 Phase 1 구현 브랜치 위에서 만들었기 때문에 AX PR #25를 develop에 병합할 때 Phase 1의 조상 커밋도 들어갔다. GitHub는 해당 커밋이 반영된 #2도 병합된 것으로 인식했다. 변경 파일을 별도로 표시한 것만으로 독립 병합이 보장되지 않았다.

## 올바른 병합 순서

1. #25 전체를 되돌리는 복구 PR을 사람이 검토·병합한다. 임의 reset·강제 push는 하지 않는다.
2. 병합 전 develop `89c3c95`를 기준으로 만든 이 AX 전용 PR을 검토·병합한다.
3. Phase 1은 별도 PR #21에서 팀 리뷰를 계속한다. 앱 구현을 AX PR의 기준 브랜치로 사용하지 않는다.

복구 PR을 먼저 병합하기 전에는 AX 전용 PR을 병합하지 않는다. 복구 PR은 잠시 AX도 제거하지만 이 전용 PR에서 AX를 다시 한 번에 도입한다. 이력과 GitHub의 기존 병합 기록은 보존된다. 파일 복구로 #2의 GitHub 병합 상태가 자동으로 되돌아가지는 않는다.

## AX 전용 PR의 범위

- 이슈 폼·라벨·마일스톤·영역 설정과 PR 템플릿
- AGENTS.md·CLAUDE.md·skills
- issue-ym / issue-mj / issue-zy 입력함
- collaborator 제한·Claude 피드백·조정 이슈 생성
- AX 지표·테스트·CI

제외: src/, risk_issue/, 앱 HTML·CSS, 앱 설계 문서, root package.json/lockfile, Vite·Vitest·TypeScript·jsdom 및 앱 테스트.

## 검사 도구의 분리

AX 개발 의존성은 `tools/ax/package.json`에만 있다. Oxlint만 설치하며 Node 내장 테스트·Python 표준 라이브러리 테스트를 실행한다. `.github/workflows/ci.yml`의 lint·test도 이 경로를 사용한다.

```sh
npm ci --prefix tools/ax
npm run check --prefix tools/ax
```

앱의 package.json이나 src가 없어도 AX 검사·자동화가 동작한다. 현재 CI의 범위는 AX다. Phase 1 앱 검사는 앱 도입 PR에서 별도 연결하며 AX CI 통과를 앱 테스트 통과로 해석하지 않는다.

`.github/areas.yml`, `.github/ax-issue-intake.json`의 앱 영역명·프로젝트 번호·사용자 매핑은 저장소별 설정이다. 존재하지 않는 앱 모듈을 import하거나 실행하는 의존성이 아니다.

## 활성화 상태

브랜치 분리와 이슈 자동화 활성화는 별개다. Claude Secret·라벨·프로젝트 자동 추가·활성화 변수는 기존 안내에 따라 사람이 설정한다. 입력 자동화는 기본 브랜치의 검토된 코드를 사용하므로 기본 브랜치 main에 반영되기 전까지 활성화하지 않는다. 현재 PR을 develop에 병합한 것만으로 AI 분석이 자동 활성화되지는 않는다.
