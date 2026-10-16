/* @vitest-environment node */

import { execFileSync } from "child_process";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readArticleBaseline } from "./article-baseline";
import { articleChanges, readArticleSources } from "./articles";

let repo: string;

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

async function write(relative: string, content: string) {
	await mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
	await writeFile(path.join(repo, relative), content);
}

beforeEach(async () => {
	repo = await mkdtemp(path.join(os.tmpdir(), "policai-article-baseline-"));
	git("init", "-q", "-b", "main");
	git("config", "user.email", "fixture@example.invalid");
	git("config", "user.name", "Fixture");
	git("config", "commit.gpgsign", "false");
	await write("data/articles/kept.md", "kept\n");
	await write("data/articles/edited.md", "before\n");
	await write("data/articles/nested/ignored.md", "nested\n");
	git("add", ".");
	git("commit", "-q", "-m", "base");
	git("update-ref", "refs/remotes/origin/main", "HEAD");
	await write("data/articles/edited.md", "after\n");
	await write("data/articles/added.md", "added\n");
	git("checkout", "-q", "-b", "feature");
	git("add", ".");
	git("commit", "-q", "-m", "change");
});

afterEach(async () => {
	await rm(repo, { recursive: true, force: true });
});

describe("readArticleBaseline", () => {
	it("reads the merge-base with origin/main and classifies each piece", async () => {
		const base = await readArticleBaseline({ cwd: repo });
		expect(base).toEqual([
			{ slug: "edited", source: "before\n" },
			{ slug: "kept", source: "kept\n" },
		]);
		const current = await readArticleSources(path.join(repo, "data/articles"));
		expect(Object.fromEntries(articleChanges(current, base))).toEqual({
			added: "new",
			edited: "changed",
			kept: "untouched",
		});
	});

	it("prefers an explicit base SHA", async () => {
		const head = git("rev-parse", "HEAD");
		expect(await readArticleBaseline({ cwd: repo, baseSha: head })).toEqual([
			{ slug: "added", source: "added\n" },
			{ slug: "edited", source: "after\n" },
			{ slug: "kept", source: "kept\n" },
		]);
	});

	it("returns null when no base can be resolved", async () => {
		git("update-ref", "-d", "refs/remotes/origin/main");
		expect(await readArticleBaseline({ cwd: repo })).toBeNull();
	});
});
