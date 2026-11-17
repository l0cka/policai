import { getDevelopments } from '@/lib/data-service';
import { jsonFeedResponse, jurisdictionFeed } from '@/lib/feeds';
import { JURISDICTIONS, isJurisdiction } from '@/types';

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
	return JURISDICTIONS.map((jurisdiction) => ({ jurisdiction }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ jurisdiction: string }> },
): Promise<Response> {
	const { jurisdiction } = await params;
	if (!isJurisdiction(jurisdiction)) return new Response(null, { status: 404 });
	return jsonFeedResponse(
		jurisdictionFeed(
			jurisdiction,
			await getDevelopments({ orderBy: 'detected' }),
		),
	);
}
