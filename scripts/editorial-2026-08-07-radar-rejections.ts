/**
 * Editorial decisions of 2026-08-07, executed for the maintainer.
 *
 * The maintainer reviewed the evidence pack (14 pending source reviews
 * re-verified against their live official sources on 2026-08-07) and
 * directed: reject all fourteen. Three duplicate already-verified records;
 * the remaining eleven are speeches, media releases, or news items rather
 * than policy instruments or discrete policy milestones. Rejection also
 * dismisses each linked development, clearing the public radar queue.
 */
import { rejectStagedSource } from '../src/lib/source-ingest';
import { getSourceReviews } from '../src/lib/data-service';

const REJECTS: Array<[string, string]> = [
  [
    '1qa7cww',
    'Duplicate CAA announcement URL for verified register record sa-courts-genai-guidelines; same instrument, effective 1 January 2026 under the UCR/USSR/JCR. No new register record required.',
  ],
  [
    'dt0ni8',
    'Superseded revision of the detection already published as verified timeline event tl-2026-05-13-senate-ai-data-centres-inquiry; the live inquiry page matches the published record.',
  ],
  [
    'lk6582',
    'Duplicate of verified timeline event tl-2025-02-03-nsw-supreme-court-practice-note-sc-gen-23-commence; the instrument is already register record nsw-supreme-court-sc-gen-23.',
  ],
  [
    '78k67w',
    'Official speech, not a policy instrument or discrete policy milestone; the whole-of-government AI agenda it describes is already tracked by existing register records.',
  ],
  [
    '14ux582',
    "Historic 2016 ASIC chairman's speech; official commentary, not a policy instrument or discrete policy milestone.",
  ],
  [
    '18rgxv3',
    'ASIC Chair keynote; official commentary, not a policy instrument or discrete policy milestone.',
  ],
  [
    '1e08te2',
    "Opening statement to the Adopting AI select committee; official commentary, not an instrument. The inquiry's report and government response are already verified timeline events.",
  ],
  [
    'xf7zzo',
    'ASIC Chair keynote; official commentary, not a policy instrument or discrete policy milestone.',
  ],
  [
    'e0tsfo',
    'Media release announcing eSafety research findings; not a policy instrument or discrete policy milestone.',
  ],
  [
    'td6oyd',
    "ASD news statement on agentic-AI risk; official commentary without an accompanying guidance product. ASD's substantive frontier-AI guidance is already a register record.",
  ],
  [
    'v2vvmh',
    'ASIC media release urging cyber uplift; not a policy instrument or discrete policy milestone.',
  ],
  [
    '14iujxd',
    'ASIC enforcement-operations media release; not a policy instrument or discrete policy milestone.',
  ],
  [
    'rjkukc',
    'Consumer-education news item; not a policy instrument or discrete policy milestone.',
  ],
  [
    'l9snlx',
    'eSafety awareness media release; not a policy instrument or discrete policy milestone.',
  ],
];

async function resolve(suffix: string) {
  const reviews = await getSourceReviews();
  const hits = reviews.filter((review) => review.id.endsWith(suffix));
  if (hits.length !== 1) {
    throw new Error(`suffix ${suffix} matched ${hits.length} reviews`);
  }
  return hits[0];
}

async function main() {
  const failures: string[] = [];

  for (const [suffix, reason] of REJECTS) {
    try {
      const review = await resolve(suffix);
      if (review.status !== 'pending_review') {
        console.log(`SKIP reject ${suffix}: already ${review.status}`);
        continue;
      }
      await rejectStagedSource(review.id, reason);
      console.log(`REJECTED  ${suffix}`);
    } catch (error) {
      failures.push(`reject ${suffix}`);
      console.error(`FAILED reject ${suffix}:`, String(error).slice(0, 200));
    }
  }

  if (failures.length > 0) {
    throw new Error(`editorial pass incomplete: ${failures.join(', ')}`);
  }
  console.log('All 14 pending reviews rejected; radar queue cleared.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
