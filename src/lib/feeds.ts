import type { Follow } from '@/lib/follows';
import { SITE_URL } from '@/lib/site-seo';
import { getThemeLabel, type ThemeId } from '@/lib/themes';
import { escapeXml } from '@/lib/xml';
import {
	getJurisdictionName,
	getPolicyStatusName,
	getPolicyTypeName,
	type Development,
	type Jurisdiction,
	type Policy,
} from '@/types';

export const FEED_ITEM_LIMIT = 40;
export const ATOM_CONTENT_TYPE = 'application/atom+xml; charset=utf-8';
export const JSON_FEED_CONTENT_TYPE = 'application/feed+json; charset=utf-8';

export interface FeedItem {
	id: string;
	url: string;
	title: string;
	summary?: string;
	published: string;
	updated: string;
	related: { url: string; title: string };
	categories: string[];
}

export interface FeedDocument {
	title: string;
	description: string;
	homeUrl: string;
	atomUrl: string;
	jsonUrl?: string;
	items: FeedItem[];
}

export type ScopedFeedDocument = FeedDocument & { jsonUrl: string };

export interface ScopedFeedPaths {
	atom: string;
	json: string;
}

export function scopedFeedPaths(
	kind: 'jurisdiction' | 'theme',
	id: string,
): ScopedFeedPaths {
	const base = `/feeds/${kind}/${id}`;
	return { atom: `${base}/feed.xml`, json: `${base}/feed.json` };
}

export interface FollowFeed extends ScopedFeedPaths {
	label: string;
}

export function feedForFollow(follow: Follow): FollowFeed | null {
	if (follow.kind === 'policy') return null;
	const label =
		follow.kind === 'jurisdiction'
			? `${getJurisdictionName(follow.id)} developments`
			: `${getThemeLabel(follow.id)} records`;
	return { label, ...scopedFeedPaths(follow.kind, follow.id) };
}

function isoDate(value: Date | string): string {
	return new Date(value).toISOString();
}

export function developmentFeedItem(development: Development): FeedItem {
	const detected = isoDate(development.detectedAt);
	return {
		id: development.url,
		url: development.url,
		title: development.title,
		summary: development.summary || undefined,
		published: detected,
		updated: detected,
		related: {
			url: `${SITE_URL}/developments#${development.id}`,
			title: 'On Policai',
		},
		categories: [
			getJurisdictionName(development.jurisdiction),
			development.verification.status === 'verified'
				? 'Verified'
				: 'Needs review',
		],
	};
}

export function policyFeedItem(policy: Policy): FeedItem {
	const url = `${SITE_URL}/policies/${policy.id}`;
	return {
		id: url,
		url,
		title: policy.title,
		summary: policy.description || undefined,
		published: isoDate(policy.createdAt),
		updated: isoDate(policy.updatedAt),
		related: { url: policy.sourceUrl, title: 'Official source' },
		categories: [
			getJurisdictionName(policy.jurisdiction),
			getPolicyTypeName(policy.type),
			getPolicyStatusName(policy.status),
		],
	};
}

export function registerFeed(developments: readonly Development[]): FeedDocument {
	return {
		title: 'Policai — Australian AI policy developments',
		description:
			'Newly detected Australian AI policy, regulation and court guidance. Subscribe from /developments or /this-week; JSON at /api/developments.',
		homeUrl: `${SITE_URL}/developments`,
		atomUrl: `${SITE_URL}/feed.xml`,
		items: developments.slice(0, FEED_ITEM_LIMIT).map(developmentFeedItem),
	};
}

export function jurisdictionFeed(
	jurisdiction: Jurisdiction,
	developments: readonly Development[],
): ScopedFeedDocument {
	const name = getJurisdictionName(jurisdiction);
	const paths = scopedFeedPaths('jurisdiction', jurisdiction);
	return {
		title: `Policai — ${name} AI policy developments`,
		description: `Newly detected AI policy, regulation and court guidance for ${name}. Machine detections are marked "Needs review" until an editor verifies them.`,
		homeUrl: `${SITE_URL}/developments`,
		atomUrl: `${SITE_URL}${paths.atom}`,
		jsonUrl: `${SITE_URL}${paths.json}`,
		items: developments
			.filter((development) => development.jurisdiction === jurisdiction)
			.slice(0, FEED_ITEM_LIMIT)
			.map(developmentFeedItem),
	};
}

export function themeFeed(
	theme: ThemeId,
	policies: readonly Policy[],
): ScopedFeedDocument {
	const label = getThemeLabel(theme);
	const paths = scopedFeedPaths('theme', theme);
	return {
		title: `Policai — ${label} register records`,
		description: `New and updated verified records in the Policai register of Australian AI policy on the theme "${label}".`,
		homeUrl: `${SITE_URL}/coverage?theme=${theme}`,
		atomUrl: `${SITE_URL}${paths.atom}`,
		jsonUrl: `${SITE_URL}${paths.json}`,
		items: policies
			.filter((policy) => policy.themes.includes(theme))
			.map(policyFeedItem)
			.sort(
				(a, b) =>
					b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id),
			)
			.slice(0, FEED_ITEM_LIMIT),
	};
}

function feedUpdated(items: readonly FeedItem[], now: Date): string {
	return items.reduce(
		(latest, item) => (item.updated > latest ? item.updated : latest),
		items[0]?.updated ?? now.toISOString(),
	);
}

function atomEntry(item: FeedItem): string {
	const categories = item.categories
		.map((category) => `    <category term="${escapeXml(category)}"/>\n`)
		.join('');
	const summary = item.summary
		? `    <summary type="html">${escapeXml(item.summary)}</summary>\n`
		: '';
	return `  <entry>
    <id>${escapeXml(item.id)}</id>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(item.url)}" rel="alternate"/>
    <link href="${escapeXml(item.related.url)}" rel="related" title="${escapeXml(item.related.title)}"/>
    <published>${item.published}</published>
    <updated>${item.updated}</updated>
    <author><name>Policai</name></author>
${categories}${summary}  </entry>`;
}

export function renderAtomFeed(feed: FeedDocument, now = new Date()): string {
	const jsonLink = feed.jsonUrl
		? `  <link href="${escapeXml(feed.jsonUrl)}" rel="alternate" type="application/feed+json"/>\n`
		: '';
	const entries = feed.items.map((item) => `${atomEntry(item)}\n`).join('');
	return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feed.title)}</title>
  <subtitle>${escapeXml(feed.description)}</subtitle>
  <link href="${escapeXml(feed.homeUrl)}" rel="alternate"/>
  <link href="${escapeXml(feed.atomUrl)}" rel="self"/>
${jsonLink}  <id>${escapeXml(feed.atomUrl)}</id>
  <updated>${feedUpdated(feed.items, now)}</updated>
${entries}</feed>
`;
}

export function renderJsonFeed(feed: ScopedFeedDocument): string {
	return JSON.stringify({
		version: 'https://jsonfeed.org/version/1.1',
		title: feed.title,
		description: feed.description,
		home_page_url: feed.homeUrl,
		feed_url: feed.jsonUrl,
		language: 'en-AU',
		authors: [{ name: 'Policai', url: SITE_URL }],
		items: feed.items.map((item) => ({
			id: item.id,
			url: item.url,
			external_url: item.related.url,
			title: item.title,
			content_text: item.summary ?? item.title,
			date_published: item.published,
			date_modified: item.updated,
			tags: item.categories,
		})),
	});
}

export function atomResponse(feed: FeedDocument): Response {
	return new Response(renderAtomFeed(feed), {
		headers: { 'Content-Type': ATOM_CONTENT_TYPE },
	});
}

export function jsonFeedResponse(feed: ScopedFeedDocument): Response {
	return new Response(renderJsonFeed(feed), {
		headers: { 'Content-Type': JSON_FEED_CONTENT_TYPE },
	});
}
