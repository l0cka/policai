import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repositoryRoot = new URL('../..', import.meta.url).pathname;
const script = readFileSync(new URL('../../ops/verify-deadlines.sh', import.meta.url), 'utf8');

test('the deadline verifier runs no model CLI and no tools', () => {
  assert.doesNotMatch(script, /claude/i);
  assert.doesNotMatch(script, /--tools|WebFetch|Bash\(/);
  assert.match(script, /flock -n 9/);
  assert.match(script, /src\/verify-deadlines\.ts/);
  assert.match(script, /src\/save-deadline-verification\.ts "\$item_id"/);
  assert.doesNotMatch(script, /VERIFIER_API_KEY=/);
});

function runWith(proposals) {
  const dir = mkdtempSync(join(tmpdir(), 'probono-verify-boundary-'));
  const stub = join(dir, 'docker-stub.mjs');
  writeFileSync(
    stub,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args.at(-1) === 'src/verify-deadlines.ts') {
  process.stdout.write(${JSON.stringify(JSON.stringify(proposals))});
} else if (args.includes('src/save-deadline-verification.ts')) {
  appendFileSync(join(process.env.PROBONO_TEST_DIR, 'saved.jsonl'),
    JSON.stringify({ itemId: args.at(-1), payload: JSON.parse(readFileSync(0, 'utf8')) }) + '\\n');
} else {
  process.stderr.write('unexpected docker invocation: ' + JSON.stringify(args));
  process.exit(64);
}
`,
    { mode: 0o755 },
  );
  chmodSync(stub, 0o755);
  try {
    const out = execFileSync('bash', ['ops/verify-deadlines.sh'], {
      cwd: repositoryRoot,
      env: { ...process.env, PROBONO_TEST_DIR: dir, PROBONO_DOCKER_BIN: stub },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let saved = [];
    try {
      saved = readFileSync(join(dir, 'saved.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    } catch {}
    return { ok: true, out, saved };
  } catch (err) {
    return { ok: false, status: err.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('each proposal is saved by its own item id, with only model and output passed on', () => {
  const r = runWith([
    { item_id: 17, model: 'm', page_via: 'direct', output: { verdicts: [] }, extra: '$(touch owned)' },
    { item_id: 18, model: 'm', page_via: 'firecrawl', output: { verdicts: [] } },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.saved.map((s) => s.itemId), ['17', '18']);
  assert.deepEqual(Object.keys(r.saved[0].payload).sort(), ['model', 'output']);
});

test('a malformed batch is refused before anything is saved', () => {
  assert.equal(runWith([{ item_id: '17; rm -rf /', model: 'm', output: {} }]).ok, false);
  assert.equal(runWith([{ item_id: 17, model: 'm', output: {} }, { item_id: 17, model: 'm', output: {} }]).ok, false);
  assert.equal(runWith(Array.from({ length: 26 }, (_, i) => ({ item_id: i + 1, model: 'm', output: {} }))).ok, false);
});
