import path from 'node:path';
import { cliRun, parseCli } from '../src/lib/cli-args';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import {
  applyRegisterAuditEvidence,
  auditRegister,
  createRegisterAuditGate,
  registerAuditRetrievalOptions,
} from '../src/lib/register-audit';
import type { Policy } from '../src/types';

const POLICIES_FILE = path.join(
  process.cwd(),
  'data',
  'policies.json',
);

const FLAGS = {
  source: { type: 'string', value: '<policy-id>', help: 'audit one register record' },
  'write-evidence': { type: 'boolean', help: 'record fingerprints and mark changed records stale' },
  strict: { type: 'boolean', help: 'also fail when a source cannot be retrieved' },
  json: { type: 'boolean', help: 'print the report as JSON' },
} as const;

interface Options {
  json: boolean;
  strict: boolean;
  writeEvidence: boolean;
  sourceId?: string;
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
    gate: createRegisterAuditGate(),
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
  const { values } = cliRun(parseCli('npm run audit:register --', FLAGS, process.argv.slice(2)));
  const options: Options = {
    json: values.json,
    strict: values.strict,
    writeEvidence: values['write-evidence'],
    sourceId: values.source,
  };
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
