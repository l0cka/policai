/* @vitest-environment node */

import { execFileSync } from "child_process";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readArticleBaseline } from "./article-baseline";

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
	it("reads top-level pieces at the merge-base with origin/main", async () => {
		expect(await readArticleBaseline({ cwd: repo })).toEqual([
			{ slug: "edited", source: "before\n" },
			{ slug: "kept", source: "kept\n" },
		]);
	});

	it("prefers an explicit base SHA", async () => {
		const head = git("rev-parse", "HEAD");
		expect(await readArticleBaseline({ cwd: repo, baseSha: head })).toEqual([
			{ slug: "added", source: "added\n" },
			{ slug: "edited", source: "after\n" },
			{ slug: "kept", source: "kept\n" },
		]);
	});

	it("returns null when no base is set and no merge-base can be resolved", async () => {
		git("update-ref", "-d", "refs/remotes/origin/main");
		expect(await readArticleBaseline({ cwd: repo })).toBeNull();
		expect(await readArticleBaseline({ cwd: repo, baseSha: " " })).toBeNull();
	});

	it("fails closed when an explicit base SHA cannot be read", async () => {
		const missing = "0123456789abcdef0123456789abcdef01234567";
		await expect(
			readArticleBaseline({ cwd: repo, baseSha: missing }),
		).rejects.toThrow(
			`GITHUB_BASE_SHA "${missing}" cannot be read, so article transitions cannot be checked`,
		);
	});
});
