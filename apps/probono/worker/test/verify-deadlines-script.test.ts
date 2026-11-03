import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../../ops/verify-deadlines.sh');

// Fake docker: the verify step prints two proposals; saving item 1 fails.
function run() {
  const dir = mkdtempSync(join(tmpdir(), 'vd-'));
  const docker = join(dir, 'docker');
  writeFileSync(docker, `#!/usr/bin/env bash
case "$*" in
  *src/verify-deadlines.ts*) echo '[{"item_id":1,"model":"m","output":{}},{"item_id":2,"model":"m","output":{}}]' ;;
  *src/save-deadline-verification.ts\\ 1) cat >/dev/null; exit 3 ;;
  *) cat >>"${dir}/saved" ;;
esac
`);
  chmodSync(docker, 0o755);
  const r = spawnSync('bash', [SCRIPT], { env: { ...process.env, PROBONO_DOCKER_BIN: docker }, encoding: 'utf8' });
  return { r, saved: readFileSync(join(dir, 'saved'), 'utf8') };
}

describe('ops/verify-deadlines.sh', () => {
  it('exits nonzero when a save fails, after saving the rest', () => {
    const { r, saved } = run();
    expect(r.stderr).toContain('item 1 not saved');
    expect(saved).toContain('"model":"m"');
    expect(r.status).toBe(1);
  });
});
