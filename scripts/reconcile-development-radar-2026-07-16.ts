/**
 * Idempotent editorial disposition of legacy heuristic detections.
 *
 * The old collector treated category pages, duplicate document links and
 * source hubs as developments. Preserve them in Git for auditability, but mark
 * them dismissed so only actionable, distinct leads remain in the radar.
 */

import path from 'node:path';
import { withDataMutationLock } from '../src/lib/data-lock';
import { readJsonFile, writeJsonFile } from '../src/lib/file-store';
import type { Development } from '../src/types';

const FILE = path.join(
  process.cwd(),
  'data',
  'developments.json',
);

const DISPOSITIONS: Record<
  string,
  { reason: string; relatedPolicyId?: string }
> = {
  'dev-ai-transparency-cvt4l5': {
    reason:
      'Agency transparency page, not a discrete policy development; tracked through the agency directory.',
  },
  'dev-ai-assessment-framework-1yptmyq': {
    reason: 'Duplicate of an existing verified register record.',
    relatedPolicyId: 'nsw-artificial-intelligence-assessment-framework',
  },
  'dev-ai-strategy-and-ethics-policy-117oyz4': {
    reason:
      'Navigation/category page rather than a discrete policy instrument or dated development.',
  },
  'dev-ai-governance-assurance-and-frameworks-ev0sud': {
    reason:
      'Navigation/category page rather than a discrete policy instrument or dated development.',
  },
  'dev-ai-guidance-and-tools-9e402j': {
    reason:
      'Navigation/category page rather than a discrete policy instrument or dated development.',
  },
  'dev-australia-s-national-framework-for-the-assurance-5ivcig': {
    reason: 'Duplicate of an existing verified register record.',
    relatedPolicyId: 'national-framework-assurance-ai-government',
  },
  'dev-guideline-for-safe-and-responsible-use-of-genera-1htcnua': {
    reason: 'Duplicate document link for an existing verified register record.',
    relatedPolicyId: 'victoria-genai-guideline-vps',
  },
  'dev-national-framework-for-the-assurance-of-ai-in-go-1y23ag9': {
    reason: 'Duplicate PDF link for an existing verified register record.',
    relatedPolicyId: 'national-framework-assurance-ai-government',
  },
  'dev-wa-government-artificial-intelligence-policy-12vvhgh': {
    reason: 'Duplicate PDF link for an existing verified register record.',
    relatedPolicyId: 'wa-ai-policy-assurance-framework',
  },
  'dev-ai-knowledge-centre-1f8sbt9': {
    reason:
      'Resource hub rather than a discrete policy instrument or dated development.',
  },
  'dev-policies-standards-and-guidelinesexplore-our-sui-17w06ld': {
    reason:
      'Resource category page rather than a discrete policy instrument or dated development.',
  },
  'dev-strategiesshaping-sa-s-future-with-ai-through-re-lds9d': {
    reason:
      'Strategy category page rather than a discrete development; the underlying consultation is in the register.',
    relatedPolicyId: 'sa-ai-for-better-government-discussion-paper',
  },
};

async function reconcileDevelopmentRadar() {
  const developments = await readJsonFile<Development[]>(FILE, []);
  const ids = new Set(developments.map((development) => development.id));
  for (const id of Object.keys(DISPOSITIONS)) {
    if (!ids.has(id)) throw new Error(`Missing development: ${id}`);
  }

  const updated = developments.map((development) => {
    const disposition = DISPOSITIONS[development.id];
    if (!disposition) return development;
    return {
      ...development,
      status: 'dismissed' as const,
      dismissalReason: disposition.reason,
      relatedPolicyId:
        disposition.relatedPolicyId ?? development.relatedPolicyId,
    };
  });
  await writeJsonFile(FILE, updated);
  console.log(
    `Dismissed ${Object.keys(DISPOSITIONS).length} duplicate or non-actionable legacy radar items.`,
  );
}

async function main() {
  await withDataMutationLock(reconcileDevelopmentRadar);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
