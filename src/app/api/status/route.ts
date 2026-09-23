import {
	getCollectionMeta,
	getDevelopments,
	getPolicies,
	getSourceCheckTimes,
	getSourceMonitoring,
} from "@/lib/data-service";
import {
	summarizeRecordCompleteness,
	summarizeRecordFreshness,
} from "@/lib/coverage-report";
import { WATCH_SOURCES } from "@/lib/pipeline/sources";
import {
	checkPublicApiRequest,
	publicApiJson,
	publicApiOptions,
} from "@/lib/public-api";
import {
	assessSourceFreshness,
	summarizeSourceFreshness,
} from "@/lib/source-freshness";
import { summarizeManualSourceCoverage } from "@/lib/source-monitoring";

export async function GET(request?: Request) {
	const limited = checkPublicApiRequest(request);
	if (limited) return limited;

	const [meta, recentDevelopments, monitoring, checkTimes, policies] =
		await Promise.all([
			getCollectionMeta(),
			getDevelopments({ limit: 1 }),
			getSourceMonitoring(),
			getSourceCheckTimes(),
			getPolicies(),
		]);
	const manualCoverage = summarizeManualSourceCoverage(
		WATCH_SOURCES,
		monitoring,
	);

	const freshness = summarizeSourceFreshness(
		assessSourceFreshness(WATCH_SOURCES, checkTimes),
	);

	const recordFreshness = summarizeRecordFreshness(policies);
	const completeness = summarizeRecordCompleteness(policies);
	const latest = recentDevelopments[0];

	return publicApiJson({
		lastCollectedAt: meta.lastCollectedAt,
		lastHealthyAt: meta.lastHealthyAt,
		lastReviewedAt: meta.lastReviewedAt,
		collection: {
			health: meta.collector.health,
			dueSourceCount: meta.collector.dueSourceCount,
			successfulSourceCount: meta.collector.successfulSourceCount,
			failedSourceCount: meta.collector.failedSourceCount,
			successRate: meta.collector.successRate,
			automaticSourceCount: meta.collector.automaticSourceCount,
			manualSourceCount: meta.collector.manualSourceCount,
			manualCurrentCount: manualCoverage.current,
			manualUnavailableCount: manualCoverage.unavailable,
			overdueSourceCount: freshness.overdue,
			neverCheckedSourceCount: freshness.neverChecked,
		},
		records: {
			publicCount: policies.length,
			overdueReviewCount: recordFreshness.overdue,
			oldestReviewAgeDays: recordFreshness.oldestAgeDays,
			completeCount: completeness.complete,
			missingExpectedFields: Object.fromEntries(
				Object.entries(completeness.missing).map(([field, ids]) => [
					field,
					ids.length,
				]),
			),
		},
		latestDevelopment: latest
			? {
					id: latest.id,
					title: latest.title,
					url: latest.url,
					detectedAt: latest.detectedAt,
					verificationStatus: latest.verification.status,
				}
			: null,
		success: true,
	});
}

export function OPTIONS() {
	return publicApiOptions();
}
