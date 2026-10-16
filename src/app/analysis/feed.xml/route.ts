import { articleEditorialDate } from '@/lib/articles';
import { getArticles } from '@/lib/data-service';
import { escapeXml } from '@/lib/xml';
import { ARTICLE_TYPE_NAMES } from '@/types';

export const revalidate = 300;

const SITE_URL = 'https://policai.org';

function atomDate(date: string): string {
	return `${date}T00:00:00Z`;
}

export async function GET(): Promise<Response> {
	const articles = (await getArticles()).slice(0, 40);
	const updated = articles.length
		? atomDate(articles.map(articleEditorialDate).sort().at(-1)!)
		: new Date().toISOString();

	const entries = articles
		.map((article) => {
			const url = `${SITE_URL}/analysis/${article.slug}`;
			return `  <entry>
    <id>${url}</id>
    <title>${escapeXml(article.title)}</title>
    <link href="${url}" rel="alternate"/>
    <published>${atomDate(article.publishedAt)}</published>
    <updated>${atomDate(articleEditorialDate(article))}</updated>
    <author><name>Policai</name></author>
    <category term="${escapeXml(ARTICLE_TYPE_NAMES[article.type])}"/>
    <summary>${escapeXml(article.summary)}</summary>
  </entry>`;
		})
		.join('\n');

	const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Policai analysis</title>
  <subtitle>Weekly briefings, instrument notes and explainers on Australian AI policy, signed by Policai.</subtitle>
  <link href="${SITE_URL}/analysis" rel="alternate"/>
  <link href="${SITE_URL}/analysis/feed.xml" rel="self"/>
  <id>${SITE_URL}/analysis/feed.xml</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;

	return new Response(feed, {
		headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
	});
}
