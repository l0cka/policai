import { getDevelopments } from '@/lib/data-service';
import { getJurisdictionName } from '@/types';

// Served through ISR like the other data routes: at most one regeneration per
// window, so data-only commits reach the feed without a rebuild.
export const revalidate = 300;

const SITE_URL = 'https://policai.org';

/**
 * Escapes a value for inclusion in an XML text node. Applied to every
 * interpolated field, including data sourced from third-party pages, so the
 * feed can never emit malformed XML.
 */
function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function xmlDate(value: string): string {
	return new Date(value).toISOString();
}

// GET returns an Atom 1.0 feed of recent, publicly visible developments.
// The route reuses the public read path (getDevelopments), so dismissed or
// editorially withheld entries can never reach the feed.
export async function GET(): Promise<Response> {
	const developments = await getDevelopments({ limit: 40 });
	const items = developments
		.filter((development) => development.status !== 'dismissed')
		.slice(0, 40);

	const updated = items[0] ? xmlDate(items[0].detectedAt) : new Date().toISOString();

	const entries = items
		.map((development) => {
			const url = xmlEscape(development.url);
			const title = xmlEscape(development.title);
			const detected = xmlDate(development.detectedAt);
			const jurisdiction = xmlEscape(getJurisdictionName(development.jurisdiction));
			const summary = development.summary
				? xmlEscape(development.summary)
				: '';
			const summaryXml = summary
				? `<summary type="html">${summary}</summary>`
				: '';
			return `  <entry>
    <id>${url}</id>
    <title>${title}</title>
    <link href="${url}" rel="alternate"/>
    <published>${detected}</published>
    <updated>${detected}</updated>
    <category term="${jurisdiction}"/>
${summaryXml}
  </entry>`;
		})
		.join('\n');

	const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Policai — Australian AI policy developments</title>
  <subtitle>Newly detected Australian AI policy, regulation and court guidance.</subtitle>
  <link href="${SITE_URL}/developments" rel="alternate"/>
  <link href="${SITE_URL}/feed.xml" rel="self"/>
  <id>${SITE_URL}/feed.xml</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;

	return new Response(feed, {
		headers: {
			'Content-Type': 'application/atom+xml; charset=utf-8',
		},
	});
}