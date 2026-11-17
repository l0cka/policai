import { getDevelopments } from '@/lib/data-service';
import { atomResponse, registerFeed } from '@/lib/feeds';

export const revalidate = 300;

export async function GET(): Promise<Response> {
	return atomResponse(
		registerFeed(await getDevelopments({ orderBy: 'detected' })),
	);
}
