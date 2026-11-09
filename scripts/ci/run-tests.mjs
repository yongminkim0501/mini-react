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

const directory = resolve(root, 'scripts/ax');
if (!existsSync(directory)) throw new Error('AX test directory is missing');
const tests = readdirSync(directory, { recursive: true })
  .filter(path => path.endsWith('.test.mjs'))
  .map(path => resolve(directory, path));
if (!tests.length) throw new Error('AX Node unit tests are missing');
run(process.execPath, ['--test', ...tests]);
const metricsTests = resolve(root, 'scripts/ax/test_metrics.py');
if (!existsSync(metricsTests)) throw new Error('AX metrics unit tests are missing');
run('python3', [metricsTests], { PYTHONDONTWRITEBYTECODE: '1' });
run('bash', ['-n', resolve(directory, 'create-labels.sh'), resolve(directory, 'sync-skills.sh')]);
