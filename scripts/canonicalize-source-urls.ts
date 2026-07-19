/**
 * Normalize source-bearing URLs in Git-backed canonical data.
 *
 * This is an explicit maintenance command, not part of collection. Normal
 * writes canonicalize at the data-service boundary and validation rejects new
 * cosmetic variants; this command migrates legacy/manual JSON edits.
 */
import path from "node:path";
import { withDataMutationLock } from "../src/lib/data-lock";
import { readJsonFile, writeJsonFile } from "../src/lib/file-store";
import { canonicalizeSourceUrl } from "../src/lib/source-url";
import type { WatchState } from "../src/lib/pipeline/collect";

const DATA_FILES = [
	"agencies.json",
	"commonwealth-agencies.json",
	"developments.json",
	"dta-ai-policy-framework.json",
	"policies.json",
	"source-monitoring.json",
	"source-reviews.json",
	"timeline.json",
	"watch-state.json",
] as const;

const SOURCE_URL_FIELDS = new Set([
	"finalUrl",
	"sourceUrl",
	"transparencyStatementUrl",
	"url",
	"website",
]);

function canonicalizeValue(value: unknown): { value: unknown; changed: boolean } {
	if (Array.isArray(value)) {
		let changed = false;
		const normalized = value.map((item) => {
			const result = canonicalizeValue(item);
			changed ||= result.changed;
			return result.value;
		});
		return { value: changed ? normalized : value, changed };
	}
	if (!value || typeof value !== "object") {
		return { value, changed: false };
	}

	let changed = false;
	const normalized: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (
			SOURCE_URL_FIELDS.has(key) &&
			typeof item === "string" &&
			item.startsWith("http")
		) {
			const canonical = canonicalizeSourceUrl(item);
			normalized[key] = canonical;
			changed ||= canonical !== item;
			continue;
		}
		const result = canonicalizeValue(item);
		normalized[key] = result.value;
		changed ||= result.changed;
	}
	return { value: changed ? normalized : value, changed };
}

function canonicalizeWatchStateKeys(state: WatchState): boolean {
	let changed = false;
	const seen: WatchState["seen"] = {};
	for (const [legacyKey, entry] of Object.entries(state.seen)) {
		let key = legacyKey;
		if (entry.candidate) {
			const canonical = new URL(
				canonicalizeSourceUrl(entry.candidate.url),
			);
			if (entry.candidate.changeFingerprint) {
				canonical.hash = `policai-change=${entry.candidate.changeFingerprint}`;
			}
			key = canonical.toString();
		}
		if (seen[key]) {
			throw new Error(`Canonical watch-state URL collision: ${key}`);
		}
		seen[key] = entry;
		changed ||= key !== legacyKey;
	}
	if (changed) state.seen = seen;
	return changed;
}

async function main(): Promise<void> {
	await withDataMutationLock(async () => {
		for (const filename of DATA_FILES) {
			const file = path.join(process.cwd(), "data", filename);
			const current = await readJsonFile<unknown>(file, null);
			const result = canonicalizeValue(current);
			const normalized = result.value;
			const changedKeys =
				filename === "watch-state.json" && normalized
					? canonicalizeWatchStateKeys(normalized as WatchState)
					: false;
			if (!result.changed && !changedKeys) continue;
			await writeJsonFile(file, normalized);
			console.log(`canonicalize-source-urls: updated ${filename}`);
		}
	});
}

main().catch((error) => {
	console.error("canonicalize-source-urls: fatal", error);
	process.exitCode = 1;
});
