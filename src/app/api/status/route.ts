import { NextResponse } from "next/server";
import {
	getCollectionMeta,
	getDevelopments,
	getSourceMonitoring,
} from "@/lib/data-service";
import { WATCH_SOURCES } from "@/lib/pipeline/sources";
import { summarizeManualSourceCoverage } from "@/lib/source-monitoring";

export async function GET() {
	const [meta, recentDevelopments, monitoring] = await Promise.all([
		getCollectionMeta(),
		getDevelopments({ limit: 1 }),
		getSourceMonitoring(),
	]);
	const manualCoverage = summarizeManualSourceCoverage(
		WATCH_SOURCES,
		monitoring,
	);

	const latest = recentDevelopments[0];

	return NextResponse.json({
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
