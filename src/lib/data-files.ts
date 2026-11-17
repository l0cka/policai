import path from "node:path";

export const DATA_FILES = Object.freeze({
	policies: "data/policies.json",
	agencies: "data/agencies.json",
	commonwealthAgencies: "data/commonwealth-agencies.json",
	timeline: "data/timeline.json",
	developments: "data/developments.json",
	policyFramework: "data/dta-ai-policy-framework.json",
	bodies: "data/bodies.json",
	siteReuse: "data/site-reuse.json",
	ruleScope: "data/rule-scope.json",
	sourceReviews: "data/source-reviews.json",
	sourceMonitoring: "data/source-monitoring.json",
	watchState: "data/watch-state.json",
	mcpAuditLog: "data/mcp-audit-log.json",
	articles: "data/articles",
	meta: "public/data/meta.json",
} as const);

export function dataFile(
	name: keyof typeof DATA_FILES,
	root: string = process.cwd(),
): string {
	return path.join(root, DATA_FILES[name]);
}
