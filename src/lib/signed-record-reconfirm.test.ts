/* @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { buildPolicy, buildTimelineEvent } from "@/test/factories";
import { softwarePasskey } from "@/test/software-passkey";
import { validateSignedRecordChanges } from "./signed-record-changes";
import {
  approveReconfirmBatch,
  proposeReconfirmBatches,
  reconfirmApprovalSubject,
  selectReconfirmCandidates,
  type ReconfirmKind,
} from "./register-reconfirm";
import type { RegisterAuditResult } from "./register-audit";
import type { Development, Policy, TimelineEvent } from "@/types";

const NOW = new Date("2026-11-05T00:00:00.000Z");
const AT = "2026-11-06T00:00:00.000Z";
const HASH = "a".repeat(64);
const verification = {
  status: "verified" as const,
  method: "manual" as const,
  checkedAt: "2026-08-20T00:00:00.000Z",
  checkedBy: "Daniel Alkurdi",
  notes: "n",
  source: { url: "https://example.gov.au/x", contentHash: HASH },
};
const audit = (id: string): RegisterAuditResult => ({
  policyId: id,
  title: "t",
  sourceUrl: "https://example.gov.au/x",
  status: "unchanged",
  checkedAt: NOW.toISOString(),
});

function run<
  T extends { id: string; title: string; verification: Policy["verification"] },
>(kind: ReconfirmKind, records: T[]) {
  const candidates = selectReconfirmCandidates(
    records,
    { batches: [] },
    { kind, now: NOW },
  );
  const audited = records.map((r) => ({
    ...r,
    verification: { ...r.verification, lastSourceAuditAt: NOW.toISOString() },
  }));
  const { batches } = proposeReconfirmBatches(
    candidates,
    records.map((r) => audit(r.id)),
    audited,
    { batches: [] },
    { kind, now: NOW },
  );
  const editor = softwarePasskey();
  const result = approveReconfirmBatch(audited, { batches }, batches[0].id, {
    approvedBy: "Daniel Alkurdi",
    approvedAt: AT,
    approval: editor.approve(reconfirmApprovalSubject(batches[0]), {
      receivedAt: AT,
    }),
  });
  return { editor, audited, result };
}

describe("cross-check with #661", () => {
  it.each(["policy", "timeline", "development"] as const)("%s", (kind) => {
    vi.useFakeTimers({
      now: new Date("2026-11-07T00:00:00.000Z"),
      toFake: ["Date"],
    });
    const policy = { ...buildPolicy({ id: "p1" }), verification };
    const event = buildTimelineEvent({ id: "tl-1", verification });
    const dev = {
      id: "dev-1",
      title: "d",
      url: "https://example.gov.au/x",
      sourceId: "s",
      sourceName: "s",
      jurisdiction: "federal",
      detectedAt: NOW.toISOString(),
      relevanceScore: 1,
      classification: "curated",
      assessment: { method: "editorial", assessedAt: NOW.toISOString() },
      verification,
      status: "promoted",
    } as Development;
    const files = {
      policies: [policy] as Policy[],
      timeline: [event] as TimelineEvent[],
      developments: [dev],
    };
    const key =
      kind === "policy"
        ? "policies"
        : kind === "timeline"
          ? "timeline"
          : "developments";
    const { editor, audited, result } = run(kind, files[key] as never[]);
    const base = {
      passkeys: [editor.passkey],
      sourceReviews: [],
      reconfirmBatches: [],
      ...files,
      [key]: audited,
    };
    const head = {
      ...base,
      reconfirmBatches: result.ledger.batches,
      [key]: result.records,
    };
    // propose alone (audit evidence) against original files:
    const proposeOnly = validateSignedRecordChanges(
      { ...base },
      { ...base, ...files },
    );
    const approveErrors = validateSignedRecordChanges(
      head as never,
      base as never,
    );
    expect(proposeOnly.errors).toEqual([]);
    expect(approveErrors.errors).toEqual([]);
  });
});
