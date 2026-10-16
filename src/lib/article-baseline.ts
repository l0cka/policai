import { execFile } from "child_process";
import { promisify } from "util";
import type { ArticleSource } from "@/lib/articles";

const execFileAsync = promisify(execFile);

const ARTICLES_PATH = "data/articles/";

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		maxBuffer: 64 * 1024 * 1024,
	});
	return stdout;
}

async function readArticlesAt(cwd: string, ref: string): Promise<ArticleSource[]> {
	const listing = await git(cwd, [
		"ls-tree",
		"-z",
		"--name-only",
		ref,
		"--",
		ARTICLES_PATH,
	]);
	const files = listing
		.split("\0")
		.filter(
			(file) =>
				file.endsWith(".md") &&
				!file.slice(ARTICLES_PATH.length).includes("/"),
		)
		.sort();
	return Promise.all(
		files.map(async (file) => ({
			slug: file.slice(ARTICLES_PATH.length, -".md".length),
			source: await git(cwd, ["show", `${ref}:${file}`]),
		})),
	);
}

export async function readArticleBaseline(options: {
	cwd: string;
	baseSha?: string;
}): Promise<ArticleSource[] | null> {
	const baseSha = options.baseSha?.trim();
	if (baseSha) {
		try {
			return await readArticlesAt(options.cwd, baseSha);
		} catch (error) {
			throw new Error(
				`GITHUB_BASE_SHA "${baseSha}" cannot be read, so article transitions cannot be checked (${(error as Error).message.trim()})`,
			);
		}
	}
	try {
		const mergeBase = await git(options.cwd, ["merge-base", "HEAD", "origin/main"]);
		return await readArticlesAt(options.cwd, mergeBase.trim());
	} catch {
		return null;
	}
}
