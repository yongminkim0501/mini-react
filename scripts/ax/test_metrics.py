"""Offline checks for metric calculations; no GitHub writes or network."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ax_metrics', Path(__file__).with_name('metrics.py'))
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)


def event(kind, day, label=None, hour=0):
    return {'event': kind, 'created_at': f'2026-11-{day:02d}T{hour:02d}:00:00Z',
            'label': {'name': label}}


class MetricsTest(unittest.TestCase):
    def report(self, issues, events=None, cost=None):
        def api(path, paginate=False):
            if '/events?' in path:
                return deepcopy((events or {}).get(int(path.split('/issues/')[1].split('/')[0]), []))
            if '/issues?' in path:
                return deepcopy(issues)
            return {'title': 'test'}
        with patch.object(metrics, 'api', side_effect=api):
            return metrics.collect('team/repo', 1, metrics.timestamp('2026-11-01T00:00:00Z'),
                                   metrics.timestamp('2026-11-09T00:00:00Z'), cost)

    def issue(self, number=1, labels=('type:bug',), state='open', closed=None, body=''):
        return {'number': number, 'created_at': '2026-11-01T00:00:00Z',
                'labels': [{'name': l} for l in labels], 'state': state,
                'closed_at': closed, 'body': body}

    def test_empty_and_missing_cost_are_not_zero_division(self):
        result = self.report([])
        self.assertEqual(result['M2']['count'], 0)
        self.assertIsNone(result['M3']['median_completed_hours'])
        self.assertIsNone(result['M8']['value'])
        self.assertIsNone(result['M1']['value'])

    def test_first_ready_is_used_and_open_time_is_separate(self):
        done = self.issue(labels=('type:bug', 'ready', 'close:resolved'), state='closed',
                          closed='2026-11-05T00:00:00Z')
        open_issue = self.issue(2, ('type:feature', 'ready'))
        result = self.report([done, open_issue], {1: [event('labeled', 2, 'ready'),
                  event('unlabeled', 3, 'ready'), event('labeled', 4, 'ready')],
                  2: [event('labeled', 8, 'ready')]}, 12)
        self.assertEqual(result['M3']['median_completed_hours'], 72)
        self.assertEqual(result['M3']['issues'][1]['hours'], 24)
        self.assertEqual(result['M8']['value'], 12)

    def test_missing_ready_excluded_from_median_but_reported(self):
        result = self.report([self.issue(labels=('ready', 'type:bug', 'close:resolved'),
                          state='closed', closed='2026-11-05T00:00:00Z')])
        self.assertEqual(result['M3']['completed_total'], 1)
        self.assertEqual(result['M3']['completed_with_ready'], 0)
        self.assertEqual(len(result['M3']['missing']), 1)

    def test_prs_excluded_and_causes_deduplicated(self):
        issue = self.issue(labels=('type:bug', 'regression'), body='Caused-by #7\nCaused-by #7')
        pr = {**self.issue(2), 'pull_request': {}}
        result = self.report([issue, pr])
        self.assertEqual(result['issue_count'], 1)
        self.assertEqual(result['M4']['linked_prs'], 1)

    def test_reopen_requires_resolved_closure(self):
        result = self.report([self.issue()], {1: [event('labeled', 1, 'type:bug'),
             event('closed', 2), event('reopened', 3), event('labeled', 4, 'close:resolved'),
             event('closed', 5), event('reopened', 6)]})
        self.assertEqual(result['M6']['confirmed_resolved_bug_reopen_issues'], 1)
        self.assertEqual(len(result['M6']['events']), 1)
        self.assertIsNone(result['M6']['value'])

    def test_api_error_does_not_become_empty_report(self):
        with patch.object(metrics, 'api', side_effect=ValueError('bad response')):
            with self.assertRaises(ValueError):
                metrics.collect('team/repo', 1, metrics.timestamp('2026-11-01T00:00:00Z'),
                                metrics.timestamp('2026-11-09T00:00:00Z'), None)


if __name__ == '__main__':
    unittest.main()
