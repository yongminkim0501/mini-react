import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run']);
const automationDirectory = resolve(root, 'scripts/ax');
if (existsSync(automationDirectory)) {
  const tests = readdirSync(automationDirectory, { recursive: true })
    .filter(path => path.endsWith('.test.mjs'))
    .map(path => resolve(automationDirectory, path));
  if (tests.length) run(process.execPath, ['--test', ...tests]);
}
const metricsTests = resolve(root, 'scripts/ax/test_metrics.py');
if (existsSync(metricsTests)) run('python3', [metricsTests], { PYTHONDONTWRITEBYTECODE: '1' });
