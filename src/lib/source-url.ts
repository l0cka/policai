import type { RecordVerification, SourceEvidence } from "@/types";

/** Hosts allowed as policy/development sources besides *.gov.au. */
const EXTRA_ALLOWED_HOSTS = new Set(["www.csiro.au", "csiro.au"]);

const TRACKING_QUERY_PARAMETERS = new Set([
	"dclid",
	"fbclid",
	"gclid",
	"mc_cid",
	"mc_eid",
	"msclkid",
]);

/**
 * Return the stable identity used for source storage and comparisons.
 *
 * Meaningful query parameters are retained because government publication
 * endpoints sometimes use them to select a document. Fragments and known
 * campaign parameters cannot identify different source material, so they are
 * removed. Sorting the remaining query parameters and normalising a non-root
 * trailing slash prevents cosmetic URL variants from bypassing deduplication.
 */
export function canonicalizeSourceUrl(value: string): string {
	const url = new URL(value.trim());
	url.hash = "";
	for (const key of Array.from(url.searchParams.keys())) {
		const normalizedKey = key.toLowerCase();
		if (
			normalizedKey.startsWith("utm_") ||
			TRACKING_QUERY_PARAMETERS.has(normalizedKey)
		) {
			url.searchParams.delete(key);
		}
	}
	url.searchParams.sort();
	if (url.pathname !== "/") {
		url.pathname = url.pathname.replace(/\/+$/, "") || "/";
	}
	return url.toString();
}

/** Best-effort identity for validation paths that also need to report bad URLs. */
export function sourceUrlIdentity(value: string): string {
	try {
		return canonicalizeSourceUrl(value);
	} catch {
		return value.trim();
	}
}

export function sourceUrlsEqual(left: string, right: string): boolean {
	return sourceUrlIdentity(left) === sourceUrlIdentity(right);
}

/** All canonical URL aliases that identify one retrieved source. */
export function sourceIdentityUrls(
	primaryUrl: string | undefined,
	evidence?: SourceEvidence,
): string[] {
	return Array.from(
		new Set(
			[primaryUrl, evidence?.url, evidence?.finalUrl]
				.filter((value): value is string => Boolean(value))
				.map(sourceUrlIdentity),
		),
	);
}

export function canonicalizeSourceEvidence(
	evidence: SourceEvidence,
): SourceEvidence {
	return {
		...evidence,
		url: canonicalizeSourceUrl(evidence.url),
		...(evidence.finalUrl
			? { finalUrl: canonicalizeSourceUrl(evidence.finalUrl) }
			: {}),
		...(evidence.linkedDocuments
			? {
					linkedDocuments: evidence.linkedDocuments.map((document) => ({
						...document,
						url: canonicalizeSourceUrl(document.url),
						...(document.finalUrl
							? { finalUrl: canonicalizeSourceUrl(document.finalUrl) }
							: {}),
					})),
				}
			: {}),
	};
}

export function canonicalizeRecordVerification(
	verification: RecordVerification,
): RecordVerification {
	return {
		...verification,
		source: canonicalizeSourceEvidence(verification.source),
	};
}

export function isSafePublicHttpsUrl(url: string): boolean {
	try {
		const {
			protocol,
			hostname,
			port,
			username,
			password,
		} = new URL(url);
		if (
			protocol !== "https:" ||
			(port && port !== "443") ||
			username ||
			password
		) {
			return false;
		}
		return hostname.includes(".");
	} catch {
		return false;
	}
}

export function isAllowedSourceHost(url: string): boolean {
	try {
		if (!isSafePublicHttpsUrl(url)) return false;
		const { hostname } = new URL(url);
		return (
			hostname.endsWith(".gov.au") ||
			EXTRA_ALLOWED_HOSTS.has(hostname)
		);
	} catch {
		return false;
	}
}
