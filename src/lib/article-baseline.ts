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

export async function readArticleBaseline(options: {
	cwd: string;
	baseSha?: string;
}): Promise<ArticleSource[] | null> {
	try {
		const ref =
			options.baseSha?.trim() ||
			(await git(options.cwd, ["merge-base", "HEAD", "origin/main"])).trim();
		const listing = await git(options.cwd, [
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
		return await Promise.all(
			files.map(async (file) => ({
				slug: file.slice(ARTICLES_PATH.length, -".md".length),
				source: await git(options.cwd, ["show", `${ref}:${file}`]),
			})),
		);
	} catch {
		return null;
	}
}
