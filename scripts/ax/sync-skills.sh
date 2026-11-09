#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:-copy}"
if [[ "$mode" != copy && "$mode" != --check ]]; then
  echo 'Usage: bash scripts/ax/sync-skills.sh [--check]' >&2; exit 2
fi
status=0
for name in ax-issue-register ax-start-work ax-submit-pr ax-metrics; do
  source_file="$root/skills/$name/SKILL.md"
  for target in .claude/skills .agents/skills; do
    destination="$root/$target/$name/SKILL.md"
    if [[ "$mode" == --check ]]; then
      if ! cmp -s "$source_file" "$destination"; then
        echo "Missing or stale: $target/$name/SKILL.md" >&2
        status=1
      fi
    else
      mkdir -p "$(dirname "$destination")"
      cp "$source_file" "$destination"
      echo "Copied: $target/$name/SKILL.md"
    fi
  done
done
exit "$status"
