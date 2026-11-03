/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("deployment data packaging", () => {
	it("traces canonical and public metadata JSON into every server route", () => {
		expect(nextConfig.outputFileTracingIncludes).toMatchObject({
			"/*": expect.arrayContaining([
				"./data/**/*.json",
				"./public/data/**/*.json",
			]),
		});
	});

	it("permanently redirects the retired network view to the coverage map", async () => {
		const redirects = await nextConfig.redirects?.();
		expect(redirects).toContainEqual({
			source: "/network",
			destination: "/coverage",
			permanent: true,
		});
	});

	it("permanently redirects /policies to the register on the home page", async () => {
		const redirects = await nextConfig.redirects?.();
		expect(redirects).toContainEqual({
			source: "/policies",
			destination: "/",
			permanent: true,
		});
	});

	it("permanently redirects /developments/feed.xml to the canonical Atom feed", async () => {
		const redirects = await nextConfig.redirects?.();
		expect(redirects).toContainEqual({
			source: "/developments/feed.xml",
			destination: "/feed.xml",
			permanent: true,
		});
	});

	it("limits every page's script, style and connect sources to this origin", async () => {
		const [{ source, headers }] = (await nextConfig.headers?.()) ?? [];
		const csp = headers.find(({ key }) => key === "Content-Security-Policy")?.value ?? "";
		const directives = new Map(
			csp.split(";").map((directive) => {
				const [name, ...values] = directive.trim().split(/\s+/);
				return [name, values];
			}),
		);

		expect(source).toBe("/:path*");
		expect(directives.get("default-src")).toEqual(["'self'"]);
		expect(directives.get("script-src")).toEqual([
			"'self'",
			"'unsafe-inline'",
			"https://static.cloudflareinsights.com",
		]);
		expect(directives.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
		expect(directives.get("connect-src")).toEqual(["'self'", "https://cloudflareinsights.com"]);
		expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
		expect(directives.get("object-src")).toEqual(["'none'"]);
	});

	it("keeps the analytics beacon off the editor's approve pages", async () => {
		const rules = (await nextConfig.headers?.()) ?? [];
		const approve = rules.find(({ source }) => source === "/approve/:path*");
		const csp = approve?.headers.find(({ key }) => key === "Content-Security-Policy")?.value ?? "";

		expect(rules.at(-1)).toBe(approve);
		expect(csp).toContain("script-src 'self' 'unsafe-inline'");
		expect(csp).not.toContain("cloudflareinsights");
		expect(csp).toContain("frame-ancestors 'none'");
	});
});
