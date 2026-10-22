/* @vitest-environment node */

import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PolicyDraft, SourceReview } from "@/types";
import { fakeGitHub } from "@/test/fake-github";

const SOURCE_URL = "https://www.example.gov.au/ai-policy";
const HASH = "a".repeat(64);

function review(overrides: Partial<SourceReview> = {}): SourceReview {
	const draft: PolicyDraft = {
		id: "signal-test-policy",
		title: "Signal test AI policy",
		description: "A source-backed policy description.",
		jurisdiction: "federal",
		type: "policy",
		status: "active",
		agencies: [],
		sourceUrl: SOURCE_URL,
		content: "Key policy details.",
		aiSummary: "Machine-assisted summary.",
		tags: [],
		themes: ["ai-governance", "generative-ai"],
		dates: [
			{ type: "published", date: "2026-07-01", precision: "day", primary: true },
		],
		effectiveDate: "2026-07-01",
		createdAt: "2026-07-16T00:00:00.000Z",
		updatedAt: "2026-07-16T00:00:00.000Z",
	} as PolicyDraft;
	return {
		id: "rev-main",
		sourceUrl: SOURCE_URL,
		title: "Signal test AI policy",
		entryKind: "policy",
		status: "pending_review",
		discoveredAt: "2026-07-16T00:00:00.000Z",
		createdBy: "collector",
		analysis: {
			isRelevant: true,
			relevanceScore: 0.65,
			suggestedType: "policy",
			suggestedJurisdiction: "federal",
			summary: "A source-backed policy description.",
		},
		sourceEvidence: {
			url: SOURCE_URL,
			retrievedAt: "2026-07-16T00:00:00.000Z",
			contentHash: HASH,
		},
		proposedRecord: draft,
		updatedAt: "2026-07-16T00:00:00.000Z",
		...overrides,
	};
}

const OTHER_URL = "https://www.example.gov.au/other-policy";

const MAIN_ONLY = {
	...review({
		id: "collected-after-deploy",
		title: "Only on main",
		sourceUrl: OTHER_URL,
		sourceEvidence: {
			url: OTHER_URL,
			retrievedAt: "2026-07-16T00:00:00.000Z",
			contentHash: "b".repeat(64),
		},
	}),
	mainOnlyMarker: "collector pushed this after the last deploy",
};
MAIN_ONLY.proposedRecord = {
	...MAIN_ONLY.proposedRecord,
	id: "other-policy",
	sourceUrl: OTHER_URL,
} as PolicyDraft;

const MAIN_META_TEXT = readFileSync(
	path.join(process.cwd(), "public/data/meta.json"),
	"utf8",
);
const MAIN_META = {
	...JSON.parse(MAIN_META_TEXT),
	lastCollectedAt: "2026-10-19T03:00:00.000Z",
};

const pretty =(value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function mainFiles(target: SourceReview): Record<string, string> {
	return {
		"data/source-reviews.json": pretty([target, MAIN_ONLY]),
		"data/policies.json": pretty([]),
		"data/developments.json": pretty([]),
		"data/timeline.json": pretty([]),
		"public/data/meta.json": JSON.stringify(MAIN_META, null, 2),
	};
}

const DISK_REVIEWS = JSON.stringify([
	review({ status: "rejected", title: "Stale deployed copy" }),
]);

let root: string;
let ip = 0;

async function listTree(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true });
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
		.sort();
}

async function post(body: Record<string, unknown>) {
	const { POST } = await import("./route");
	const response = await POST(
		new Request("http://localhost/api/signal/reviews", {
			method: "POST",
			headers: {
				authorization: "Bearer signal-secret",
				"content-type": "application/json",
				"x-forwarded-for": `10.0.0.${++ip}`,
			},
			body: JSON.stringify(body),
		}),
	);
	return { status: response.status, json: await response.json() };
}

function decision(action: "approve" | "dismiss", reviewId = "rev-main") {
	return {
		reviewId,
		action,
		reviewer: "Daniel Alkurdi",
		attestation: {
			replyText: `${action} ${reviewId}`,
			chatMessageId: "msg-1",
			cardId: reviewId,
			decidedAt: "2026-10-19T05:00:00.000Z",
		},
	};
}

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "signal-route-"));
	await mkdir(path.join(root, "data"), { recursive: true });
	await writeFile(path.join(root, "data/source-reviews.json"), DISK_REVIEWS);
	vi.spyOn(process, "cwd").mockReturnValue(root);
	vi.resetModules();
	vi.stubEnv("POLICAI_SIGNAL_TOKEN", "signal-secret");
	vi.stubEnv("POLICAI_SIGNAL_GITHUB_TOKEN", "gh-token");
	vi.stubEnv("POLICAI_SIGNAL_COMMIT_TARGET", "");
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

async function expectDiskUntouched() {
	expect(await listTree(root)).toEqual(["data/source-reviews.json"]);
	expect(await readFile(path.join(root, "data/source-reviews.json"), "utf8")).toBe(
		DISK_REVIEWS,
	);
}

describe("POST /api/signal/reviews", () => {
	it("refuses approve and commits nothing", async () => {
		const github = fakeGitHub({ files: mainFiles(review()) });
		vi.stubGlobal("fetch", github.fetchImpl);

		const { status, json } = await post(decision("approve"));

		expect(status).toBe(403);
		expect(json).toMatchObject({ success: false, code: "approve_not_allowed" });
		expect(json.error).toContain("decision card");
		expect(github.requests.filter((r) => r.method !== "GET")).toEqual([]);
		await expectDiskUntouched();
	});

	it("dismisses against the snapshot even when the deployed copy disagrees", async () => {
		const github = fakeGitHub({ files: mainFiles(review()) });
		vi.stubGlobal("fetch", github.fetchImpl);

		const { status, json } = await post(decision("dismiss"));

		expect(status).toBe(200);
		expect(json).toMatchObject({
			success: true,
			noop: false,
			review: { id: "rev-main", status: "rejected" },
		});
		const files = github.committedFiles(json.persistence.commitSha);
		const reviews = JSON.parse(files["data/source-reviews.json"]);
		expect(reviews.map((r: SourceReview & { mainOnlyMarker?: string }) => [
			r.id,
			r.status,
			r.mainOnlyMarker,
		])).toEqual([
			["rev-main", "rejected", undefined],
			["collected-after-deploy", "pending_review", MAIN_ONLY.mainOnlyMarker],
		]);
		await expectDiskUntouched();
	});

	it("is a noop with no commit when main already has the decision", async () => {
		const github = fakeGitHub({
			files: mainFiles(review({ status: "rejected" })),
		});
		vi.stubGlobal("fetch", github.fetchImpl);

		const { status, json } = await post(decision("dismiss"));

		expect(status).toBe(200);
		expect(json).toMatchObject({
			noop: true,
			persistence: { ok: true, skipped: true, reason: "noop" },
		});
		expect(github.requests.filter((r) => r.method !== "GET")).toEqual([]);
		await expectDiskUntouched();
	});

	it("returns the open PR for a rerun without committing again", async () => {
		const github = fakeGitHub({
			files: mainFiles(review()),
			openPulls: [
				{
					html_url: "https://github.com/l0cka/policai/pull/41",
					number: 41,
					head: { sha: "earlier-commit" },
				},
			],
		});
		vi.stubGlobal("fetch", github.fetchImpl);

		const { status, json } = await post(decision("dismiss"));

		expect(status).toBe(200);
		expect(json.persistence).toMatchObject({
			ok: true,
			existing: true,
			commitSha: "earlier-commit",
			prUrl: "https://github.com/l0cka/policai/pull/41",
		});
		expect(github.requests.filter((r) => r.method !== "GET")).toEqual([]);
		await expectDiskUntouched();
	});

	it("fails with main_moved when main advanced before the push", async () => {
		vi.stubEnv("POLICAI_SIGNAL_COMMIT_TARGET", "main");
		const github = fakeGitHub({
			files: mainFiles(review()),
			mainMovesOnPatch: true,
		});
		vi.stubGlobal("fetch", github.fetchImpl);

		const { status, json } = await post(decision("dismiss"));

		expect(status).toBe(409);
		expect(json).toMatchObject({ success: false, code: "main_moved" });
		expect(github.refs.get("heads/main")).toBe(github.baseSha);
		await expectDiskUntouched();
	});

	it("refuses with 503 before deciding when the GitHub token is missing", async () => {
		vi.stubEnv("POLICAI_SIGNAL_GITHUB_TOKEN", "");
		const fetchImpl = vi.fn();
		vi.stubGlobal("fetch", fetchImpl);

		const { status, json } = await post(decision("dismiss"));

		expect(status).toBe(503);
		expect(json).toMatchObject({
			success: false,
			code: "github_token_unconfigured",
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		await expectDiskUntouched();
	});
});
