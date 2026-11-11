/**
 * 측정 결과 JSON(lab/results-inbox/*.json)을 합쳐 기준선 JSON과 Markdown 표를 만든다.
 * 사용: node lab/dev/make-baseline.mjs <이름> <코드 커밋> <입력.json>... 
 * 출력: docs/results/<이름>.json, docs/results/<이름>.md
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [name, commit, ...inputs] = process.argv.slice(2);
if (!name || !commit || inputs.length === 0) {
  console.error('사용: node lab/dev/make-baseline.mjs <이름> <코드 커밋> <입력.json>...');
  process.exit(1);
}

const results = inputs.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')));
const fmt = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '-');
const uniq = (values) => [...new Set(values.filter((v) => v !== null && v !== undefined))];

const env = results.map((r) => r.environment);
const environment = {
  browser: uniq(env.map((e) => e.browserVersion)).join(' / '),
  userAgent: uniq(env.map((e) => e.userAgent)).join(' / '),
  power: uniq(env.map((e) => (e.power?.charging === null ? '알 수 없음' : e.power?.charging ? `충전 중 (${Math.round((e.power.level ?? 0) * 100)}%)` : `배터리 (${Math.round((e.power.level ?? 0) * 100)}%)`))).join(' / '),
  viewport: uniq(env.map((e) => e.viewport)).join(' / '),
  devicePixelRatio: uniq(env.map((e) => e.devicePixelRatio)).join(' / '),
  hardwareConcurrency: uniq(env.map((e) => e.hardwareConcurrency)).join(' / '),
  measuredFrom: env.map((e) => e.measuredAt).sort()[0],
  measuredTo: env.map((e) => e.measuredAt).sort().at(-1),
};

const baseline = { name, codeCommit: commit, createdAt: new Date().toISOString(), environment, results };
mkdirSync('docs/results', { recursive: true });
writeFileSync(`docs/results/${name}.json`, `${JSON.stringify(baseline, null, 2)}\n`);

const sizes = uniq(results.map((r) => r.size)).sort((a, b) => b - a);
const lines = [];
lines.push(`# ${name}`, '');
lines.push(`측정 코드 커밋 \`${commit}\` · 원자료 [${name}.json](./${name}.json) · 각 시나리오 워밍업 1회 제외 ${uniq(results.map((r) => r.runs)).join('/')}회 평균`, '');
lines.push('## 측정 환경', '');
lines.push('| 항목 | 값 |', '|------|----|');
lines.push(`| 브라우저 | ${environment.browser} |`);
lines.push(`| 전원 | ${environment.power} |`);
lines.push(`| 뷰포트 | ${environment.viewport} (DPR ${environment.devicePixelRatio}) |`);
lines.push(`| 논리 코어 | ${environment.hardwareConcurrency} |`);
lines.push(`| 측정 시각(UTC) | ${environment.measuredFrom} ~ ${environment.measuredTo} |`);
lines.push('');
for (const size of sizes) {
  const rows = results.filter((r) => r.size === size);
  lines.push(`## 셀 ${size.toLocaleString('en-US')}개 (${rows[0].engine}, cellCost=${rows[0].cellCost})`, '');
  lines.push('| 시나리오 | 렌더+커밋 평균(ms) | 최장 Long Task(ms) | 지연 p95, 예정 시각 기준(ms) | 끊긴 프레임 | 진행 바 fps | 진행 바 끊김 | 실행 전 / 실행 중 주사율(Hz) |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const a = r.average;
    const latency = r.scenario === 'S2' ? `입력 ${fmt(a.inputP95)}` : r.scenario === 'S3' ? `클릭 ${fmt(a.clickP95)}` : '-';
    const observed = r.perRun.map((p) => p.refreshHzObserved).join('/');
    const unstable = r.perRun.filter((p) => p.refreshUnstable).length;
    lines.push(
      `| ${r.scenario} ${r.title.replace(/^S\d /, '')} | ${fmt(a.updateMean)} | ${fmt(a.longTaskMax)} | ${latency} | ${fmt(a.framesJank)} | ${fmt(a.progressFps)} | ${fmt(a.progressDropped)} | ${r.environment.refreshHz} / ${observed}${unstable ? ` (변경 ${unstable}회)` : ''} |`,
    );
  }
  lines.push('');
}
writeFileSync(`docs/results/${name}.md`, `${lines.join('\n')}\n`);
console.log(`docs/results/${name}.json, docs/results/${name}.md`);
