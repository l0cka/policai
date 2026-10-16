import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repositoryRoot = new URL('../..', import.meta.url).pathname;

function run(args) {
  const dir = mkdtempSync(join(tmpdir(), 'probono-requeue-boundary-'));
  const stub = join(dir, 'docker-stub.mjs');
  writeFileSync(
    stub,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const argv = process.argv.slice(2);
const stdin = argv.includes('-f') ? readFileSync(0, 'utf8') : '';
appendFileSync(join(process.env.PROBONO_TEST_DIR, 'calls.jsonl'), JSON.stringify({ argv, stdin }) + '\\n');
`,
    { mode: 0o755 },
  );
  chmodSync(stub, 0o755);
  try {
    const result = spawnSync('bash', ['ops/requeue-rejected.sh', ...args], {
      cwd: repositoryRoot,
      env: { ...process.env, PROBONO_TEST_DIR: dir, PROBONO_DOCKER_BIN: stub },
      encoding: 'utf8',
    });
    let calls = [];
    try {
      calls = readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    } catch {}
    return { status: result.status, stderr: result.stderr, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('an argument that is not a non-negative integer is refused before any database call', () => {
  for (const bad of ['1; DELETE FROM items', '-1', '1.5', '', ' 5', '5\n', '0x10', '1 OR 1=1']) {
    const r = run([bad]);
    assert.notEqual(r.status, 0, JSON.stringify(bad));
    assert.match(r.stderr, /usage:/);
    assert.deepEqual(r.calls, [], JSON.stringify(bad));
  }
});

test('a valid batch size is passed as a bound psql variable, never in the SQL text', () => {
  for (const [args, expected] of [[['50'], '50'], [[], '200'], [['0'], '0']]) {
    const r = run(args);
    assert.equal(r.status, 0);
    const update = r.calls[0];
    assert.ok(update.argv.includes(`limit=${expected}`));
    assert.match(update.stdin, /LIMIT NULLIF\(:'limit', '0'\)::bigint/);
    assert.doesNotMatch(update.stdin, new RegExp(`LIMIT\\s+${expected}\\b`));
  }
});
