import type { RecordVerification } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/i;
export const VERIFICATION_CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Editorial verification is deliberately short-lived. Automated fingerprint
 * checks can detect source changes, but they do not replace a human review of
 * the record's title, status, dates, and summary.
 */
export const EDITORIAL_REVIEW_INTERVAL_DAYS = 90;

export function isVerificationCurrent(
	verification: RecordVerification,
	now: Date = new Date(),
): boolean {
	if (
		verification.status !== "verified" ||
		verification.method !== "manual" ||
		!verification.checkedBy?.trim() ||
		!verification.checkedAt ||
		!SHA256.test(verification.source.contentHash ?? "")
	) {
		return false;
	}

	const checkedAt = new Date(verification.checkedAt).getTime();
	const nowTime = now.getTime();
	if (
		!Number.isFinite(checkedAt) ||
		!Number.isFinite(nowTime) ||
		checkedAt > nowTime + VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
	) {
		return false;
	}

	return (
		Math.max(0, nowTime - checkedAt) <=
		EDITORIAL_REVIEW_INTERVAL_DAYS * DAY_MS
	);
}

export function projectVerificationForPublic(
	verification: RecordVerification,
	now: Date = new Date(),
): RecordVerification {
	if (
		verification.status !== "verified" ||
		isVerificationCurrent(verification, now)
	) {
		return verification;
	}

	const staleReason =
		verification.method !== "manual"
			? "No manual editorial verification is recorded; human re-verification is required."
			: !verification.checkedBy?.trim()
				? "No attributable editorial reviewer is recorded; human re-verification is required."
				: SHA256.test(verification.source.contentHash ?? "")
					? `Editorial review interval of ${EDITORIAL_REVIEW_INTERVAL_DAYS} days expired; re-verification is required.`
					: "No reproducible source fingerprint is stored; fingerprinted re-verification is required.";
	return {
		...verification,
		status: "stale",
		notes: verification.notes?.includes(staleReason)
			? verification.notes
			: verification.notes
				? `${verification.notes} ${staleReason}`
				: staleReason,
	};
}
