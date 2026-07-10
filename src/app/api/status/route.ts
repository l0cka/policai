import { NextResponse } from "next/server";
import { getCollectionMeta, getDevelopments } from "@/lib/data-service";

export async function GET() {
	const [meta, recentDevelopments] = await Promise.all([
		getCollectionMeta(),
		getDevelopments({ limit: 1 }),
	]);

	const latest = recentDevelopments[0];

	return NextResponse.json({
		lastCollectedAt: meta.lastCollectedAt,
		lastReviewedAt: meta.lastReviewedAt,
		latestDevelopment: latest
			? {
					id: latest.id,
					title: latest.title,
					url: latest.url,
					detectedAt: latest.detectedAt,
				}
			: null,
		success: true,
	});
}
