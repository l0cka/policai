import { getPolicies } from '@/lib/data-service';
import { atomResponse, themeFeed } from '@/lib/feeds';
import { THEMES, isThemeId } from '@/lib/themes';

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
	return THEMES.map(({ key }) => ({ theme: key }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ theme: string }> },
): Promise<Response> {
	const { theme } = await params;
	if (!isThemeId(theme)) return new Response(null, { status: 404 });
	return atomResponse(themeFeed(theme, await getPolicies()));
}
