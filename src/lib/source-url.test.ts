import { describe, expect, it } from "vitest";
import {
	canonicalizeSourceUrl,
	sourceIdentityUrls,
	sourceUrlsEqual,
} from "@/lib/source-url";

describe("source URL identity", () => {
	it("removes cosmetic and tracking variants while retaining meaningful query parameters", () => {
		expect(
			canonicalizeSourceUrl(
				"https://Example.GOV.au/policy/?view=full&utm_source=email#section",
			),
		).toBe("https://example.gov.au/policy?view=full");
	});

	it("sorts meaningful query parameters into one identity", () => {
		expect(
			sourceUrlsEqual(
				"https://example.gov.au/search?b=2&a=1",
				"https://example.gov.au/search?a=1&b=2#results",
			),
		).toBe(true);
	});

	it("does not collapse genuinely different document selectors", () => {
		expect(
			sourceUrlsEqual(
				"https://example.gov.au/document?id=1",
				"https://example.gov.au/document?id=2",
			),
		).toBe(false);
	});

	it("includes canonical redirect aliases in source identity", () => {
		expect(
			sourceIdentityUrls("https://example.gov.au/old?utm_source=email", {
				url: "https://example.gov.au/old",
				finalUrl: "https://example.gov.au/current/",
			}),
		).toEqual([
			"https://example.gov.au/old",
			"https://example.gov.au/current",
		]);
	});
});
