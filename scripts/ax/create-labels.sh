#!/usr/bin/env bash
set -euo pipefail

# 기본은 명령 출력만. 사람이 셋업 PR 검토·병합 후 --apply OWNER/REPO로 실행합니다.
apply=false
if [[ "${1:-}" == "--apply" ]]; then apply=true; shift; fi
repo="${1:-}"
if [[ -z "$repo" || "$repo" != */* || $# -ne 1 ]]; then
  echo "Usage: bash scripts/ax/create-labels.sh [--apply] OWNER/REPO" >&2; exit 2
fi

create() {
  if "$apply"; then
    gh label create "$1" --repo "$repo" --color "$2" --description "$3"
  else
    printf "gh label create %q --repo %q --color %q --description %q\n" "$1" "$repo" "$2" "$3"
  fi
}
# 기존 라벨은 덮어쓰지 않습니다. 중복 오류가 나면 사람이 확인 후 남은 명령만 실행합니다.
create type:bug d73a4a '기대 동작과 다른 결함'
create type:feature a2eeef '미구현 기능'
create type:debt fbca04 '기술 부채와 개선 조건'
create type:risk e4e669 '수용 검토 또는 수용한 리스크'
create type:docs 0075ca '문서 작업'
create sev:high b60205 '높은 심각도'
create sev:mid d93f0b '중간 심각도'
create sev:low fbca04 '낮은 심각도'
create ready 0e8a16 '사람이 완료 조건 확인 후 착수 허용; 제거 금지'
create close:resolved 0e8a16 '완료 조건 검증 후 해결 종료'
create close:duplicate cfd3d7 '중복으로 종료'
create close:obsolete cfd3d7 '전제 변경으로 종료'
create close:wontfix ffffff '수정하지 않기로 결정'
create risk:accepted e4e669 '사람이 수용한 MVP 리스크; 열린 상태 유지'
create regression b60205 '병합된 변경으로 생긴 결함'
create area:html-to-vnode c5def5 '예상 또는 실제 변경 영역: html-to-vnode'
create area:vnode-to-dom c5def5 '예상 또는 실제 변경 영역: vnode-to-dom'
create area:vnode-to-html c5def5 '예상 또는 실제 변경 영역: vnode-to-html'
create area:diff c5def5 '예상 또는 실제 변경 영역: diff'
create area:patch c5def5 '예상 또는 실제 변경 영역: patch'
create area:state c5def5 '예상 또는 실제 변경 영역: state'
create area:app c5def5 '예상 또는 실제 변경 영역: app'
create area:shared c5def5 '예상 또는 실제 변경 영역: shared'
create area:unknown ededed '영역 미확인; 일일 동기화에서 확정'
