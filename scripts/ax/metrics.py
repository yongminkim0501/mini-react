#!/usr/bin/env python3
"""Read-only AX checkpoint metrics. Python standard library + authenticated gh."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
import re
import statistics
import subprocess
import sys


def timestamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('UTC offset is required')
    return result.astimezone(timezone.utc)


def api(path, paginate=False):
    command = ['gh', 'api', '--method', 'GET', path]
    if paginate:
        command += ['--paginate', '--slurp']
    result = json.loads(subprocess.check_output(command, text=True))
    return [item for page in result for item in page] if paginate else result


def collect(repo, milestone, since, until, cost):
    base = f'repos/{repo}'
    milestone_info = api(f'{base}/milestones/{milestone}')
    issues = [i for i in api(
        f'{base}/issues?milestone={milestone}&state=all&per_page=100', True
    ) if 'pull_request' not in i and timestamp(i['created_at']) <= until]
    completed = Counter()
    leads = []
    regressions = []
    reopened = []
    missing = []
    for issue in issues:
        number = issue['number']
        labels = {label['name'] for label in issue['labels']}
        events = api(f'{base}/issues/{number}/events?per_page=100', True)
        types = sorted(label for label in labels if label.startswith('type:'))
        closed = timestamp(issue['closed_at']) if issue.get('closed_at') else None
        resolved = ('close:resolved' in labels and issue['state'] == 'closed'
                    and closed is not None and since <= closed <= until)
        if resolved:
            completed[types[0] if len(types) == 1 else 'type:unknown'] += 1
        ready = [timestamp(e['created_at']) for e in events
                 if e.get('event') == 'labeled' and e.get('label', {}).get('name') == 'ready'
                 and timestamp(e['created_at']) <= until]
        if ready:
            start = min(ready)
            end = closed if closed and issue['state'] == 'closed' else until
            if end >= start:
                leads.append({'issue': number, 'ready_at': start.isoformat(),
                              'end_at': end.isoformat(), 'hours': (end-start).total_seconds()/3600,
                              'state': issue['state'], 'resolved_in_period': resolved})
            else:
                missing.append({'issue': number, 'reason': 'closure precedes ready'})
        elif 'ready' in labels:
            missing.append({'issue': number, 'reason': 'ready label event unavailable'})
        if 'regression' in labels and since <= timestamp(issue['created_at']) <= until:
            causes = sorted(set(map(int, re.findall(r'(?im)^\s*Caused-by\s+#(\d+)\b', issue.get('body') or ''))))
            regressions.append({'issue': number, 'caused_by_pr': causes or None})
        # Confirm a resolved closure before counting a reopen; current labels alone are insufficient.
        active_labels = set()
        resolved_closed = False
        for event in sorted(events, key=lambda e: (e['created_at'], e.get('id', 0))):
            at = timestamp(event['created_at'])
            if at > until:
                continue
            event_type = event.get('event')
            label = event.get('label', {}).get('name')
            if event_type == 'labeled':
                active_labels.add(label)
            elif event_type == 'unlabeled':
                active_labels.discard(label)
            elif event_type == 'closed':
                resolved_closed = 'close:resolved' in active_labels
            elif event_type == 'reopened':
                if resolved_closed and 'type:bug' in active_labels and since <= at <= until:
                    reopened.append({'issue': number, 'at': at.isoformat()})
                resolved_closed = False
    total = sum(completed.values())
    done_leads = [i['hours'] for i in leads if i['resolved_in_period']]
    return {
        'repository': repo, 'milestone': milestone_info['title'],
        'since': since.isoformat(), 'until': until.isoformat(),
        'collected_at': datetime.now(timezone.utc).isoformat(),
        'issue_count': len(issues),
        'M1': {'value': None, 'reason': 'initial issue bodies are not captured; current bodies are not substitutes'},
        'M2': {'count': total, 'by_type': dict(completed)},
        'M3': {'median_completed_hours': statistics.median(done_leads) if done_leads else None,
               'completed_with_ready': len(done_leads), 'completed_total': total,
               'issues': leads, 'missing': missing},
        'M4': {'regression_issues': len(regressions),
               'linked_prs': len({p for i in regressions for p in i['caused_by_pr'] or []}),
               'issues': regressions},
        'M5': {'value': None, 'reason': 'no automated closure'},
        'M6': {'value': None, 'confirmed_resolved_bug_reopen_issues': len({i['issue'] for i in reopened}),
               'events': reopened, 'reason': 'same-problem re-registration requires human review; partial count only'},
        'M7': {'value': None, 'reason': 'review daily sync waste cases; missing record does not imply zero'},
        'M8': {'approximate': True, 'cost_total': cost, 'completed_count': total,
               'value': cost/total if cost is not None and total else None},
        'limitations': [
            'Current milestone membership only: collect before handoff and reconcile transferred issues.',
            'Current labels/state/body: run at the report time; cannot reconstruct a historical snapshot.',
            'Resolved count assumes human closure and evidence review; evidence is not automatically audited.',
            'Caused-by links are recorded claims; PR merge/causality requires review.',
            'Missing initial bodies, recurrence review, waste cases and currency must be reported explicitly.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--milestone', type=int, required=True)
    parser.add_argument('--since', required=True)
    parser.add_argument('--until', required=True)
    parser.add_argument('--cost-total', type=float)
    args = parser.parse_args()
    try:
        start, end = timestamp(args.since), timestamp(args.until)
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo):
            raise ValueError('repo must be OWNER/REPO')
        if args.milestone < 1 or start > end or end > datetime.now(timezone.utc):
            raise ValueError('invalid milestone or period (future report time is not allowed)')
        if args.cost_total is not None and (args.cost_total < 0 or not math.isfinite(args.cost_total)):
            raise ValueError('cost must be finite and non-negative')
        result = collect(args.repo, args.milestone, start, end, args.cost_total)
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    except (ValueError, KeyError, subprocess.CalledProcessError, FileNotFoundError) as error:
        print(f'Metrics collection failed; no zero-filled report produced: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
