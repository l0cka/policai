/**
 * Re-check curated register sources and compare their content fingerprints.
 *
 * Usage:
 *   npm run audit:register
 *   npm run audit:register -- --source=<policy-id>
 *   npm run audit:register -- --write-evidence
 *   npm run audit:register -- --strict --json
 *
 * Each source is retrieved with a generous per-attempt timeout and exactly one
 * retry for transient failures (timeouts, DNS/socket errors, HTTP 408/429/5xx)
 * with a short backoff. Client errors such as HTTP 403 bot walls are NOT
 * retried. Honesty rule: a retried-then-failed source still reports
 * `retrieval_failed`; no failures are silently swallowed.
 *
 * Retrieval settings (defaults in parentheses):
 *   AUDIT_REGISTER_TIMEOUT_MS       per-attempt timeout in ms (45000)
 *   AUDIT_REGISTER_ATTEMPTS         attempts per source (2 = one retry)
 *   AUDIT_REGISTER_RETRY_DELAY_MS   backoff before the retry in ms (1000)
 *
 * Trade-off: the raised timeout roughly doubles the worst-case wall clock per
 * slow source (2 x 45s) in exchange for confirming sources that merely answer
 * slowly; the 2026-09-24 sweep showed most retrieval failures were 20s
 * timeouts against slow government hosts, not content changes.
 *
 * `--write-evidence` records missing fingerprints as stale baselines and marks
 * changed or confirmed-missing sources stale. It never turns an unverified or
 * stale record back into verified.
 */

import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import {
  applyRegisterAuditEvidence,
  auditRegister,
  registerAuditRetrievalOptions,
} from '../src/lib/register-audit';
import type { Policy } from '../src/types';

const POLICIES_FILE = path.join(
  process.cwd(),
  'data',
  'policies.json',
);

interface Options {
  json: boolean;
  strict: boolean;
  writeEvidence: boolean;
  sourceId?: string;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    json: false,
    strict: false,
    writeEvidence: false,
  };
  for (const arg of args) {
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--write-evidence') options.writeEvidence = true;
    else if (arg.startsWith('--source=')) options.sourceId = arg.slice(9);
  }
  return options;
}

async function runAudit(options: Options) {
  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  if (
    options.sourceId &&
    !policies.some((policy) => policy.id === options.sourceId)
  ) {
    throw new Error(`Unknown policy id: ${options.sourceId}`);
  }

  const retrieval = registerAuditRetrievalOptions();
  const results = await auditRegister(policies, {
    sourceId: options.sourceId,
    ...retrieval,
  });
  const counts = {
    unchanged: results.filter((result) => result.status === 'unchanged').length,
    baselineMissing: results.filter(
      (result) => result.status === 'baseline_missing',
    ).length,
    changed: results.filter((result) => result.status === 'changed').length,
    comparisonUnavailable: results.filter(
      (result) => result.status === 'comparison_unavailable',
    ).length,
    sourceMissing: results.filter(
      (result) => result.status === 'source_missing',
    ).length,
    retrievalFailed: results.filter(
      (result) => result.status === 'retrieval_failed',
    ).length,
  };

  if (options.writeEvidence) {
    await writeJsonFile(
      POLICIES_FILE,
      applyRegisterAuditEvidence(policies, results),
    );
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          auditedAt: new Date().toISOString(),
          wroteEvidence: options.writeEvidence,
          retrieval,
          counts,
          results,
        },
        null,
        2,
      ),
    );
  } else {
    for (const result of results) {
      const label = result.status.toUpperCase().padEnd(16);
      console.log(
        `${label} ${result.policyId}${result.error ? `: ${result.error}` : ''}`,
      );
    }
    console.log(
      `audit-register: ${counts.unchanged} unchanged, ${counts.baselineMissing} baselines missing, ${counts.changed} changed, ${counts.comparisonUnavailable} comparisons unavailable, ${counts.sourceMissing} sources missing, ${counts.retrievalFailed} retrieval failures (timeout ${retrieval.timeoutMs}ms, attempts ${retrieval.attempts}, retry delay ${retrieval.retryDelayMs}ms${options.writeEvidence ? '; evidence written' : ''})`,
    );
  }

  if (
    counts.baselineMissing > 0 ||
    counts.changed > 0 ||
    counts.sourceMissing > 0 ||
    (options.strict && counts.retrievalFailed > 0)
  ) {
    process.exitCode = 1;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.writeEvidence) {
    await withDataMutationLock(() => runAudit(options));
  } else {
    await runAudit(options);
  }
}

main().catch((error) => {
  console.error('audit-register: fatal', error);
  process.exitCode = 1;
});
