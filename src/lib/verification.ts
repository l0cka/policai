import type { RecordVerification } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/i;
export const VERIFICATION_CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Editorial verification is deliberately short-lived. Automated fingerprint
 * checks can detect source changes, but they do not replace a human review of
 * the record's title, status, dates, and summary. After this interval a
 * record stays public but is shown as "Review due" until re-verified.
 */
export const EDITORIAL_REVIEW_INTERVAL_DAYS = 90;

/**
 * True when a record was once verified by an attributable editor against a
 * fingerprinted source. Such records stay public after the review interval
 * lapses; `projectVerificationForPublic` then labels them stale ("Review
 * due") instead of hiding them. Unverified, unattributed and unfingerprinted
 * records are never public.
 */
export function isPubliclyEstablished(
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
	return (
		Number.isFinite(checkedAt) &&
		Number.isFinite(nowTime) &&
		checkedAt <= nowTime + VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
	);
}

/** Established and reviewed within the editorial review interval. */
export function isVerificationCurrent(
	verification: RecordVerification,
	now: Date = new Date(),
): boolean {
	if (!isPubliclyEstablished(verification, now)) return false;
	const checkedAt = new Date(verification.checkedAt!).getTime();
	return (
		Math.max(0, now.getTime() - checkedAt) <=
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
