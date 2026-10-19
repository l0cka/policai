import type { DataOverlayChange } from "@/lib/data-overlay";

export type SignalCommitTarget = "pr" | "main";

type Env = Readonly<Record<string, string | undefined>>;

export interface SignalSnapshotOptions {
	env?: Env;
	fetchImpl?: typeof fetch;
}

export interface SignalCommitInput {
	reviewId: string;
	action: "approve" | "dismiss";
	message: string;
	attestationText: string;
	changes: DataOverlayChange[];
}

export type SignalGitFailureCode =
	| "github_token_unconfigured"
	| "github_unavailable"
	| "main_moved"
	| "github_persist_failed";

export interface SignalGitFailure {
	ok: false;
	code: SignalGitFailureCode;
	error: string;
}

export type SignalGitPersistResult =
	| {
			ok: true;
			target: SignalCommitTarget;
			branch: string;
			commitSha: string;
			prUrl?: string;
			htmlUrl?: string;
			existing?: true;
	  }
	| SignalGitFailure;

export interface SignalSnapshot {
	baseSha: string;
	load: (repoRelativePath: string) => Promise<string | null>;
	commit: (input: SignalCommitInput) => Promise<SignalGitPersistResult>;
}

interface GhRef {
	object: { sha: string };
}

interface GhCommit {
	sha: string;
	tree: { sha: string };
}

interface GhSha {
	sha: string;
}

interface GhContents {
	type: string;
	sha: string;
	encoding?: string;
	content?: string;
}

interface GhBlobContent {
	content: string;
	encoding: string;
}

interface GhPull {
	html_url: string;
	number: number;
	head: { sha: string };
}

class GitHubError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

function commitTarget(env: Env): SignalCommitTarget {
	return env.POLICAI_SIGNAL_COMMIT_TARGET?.trim() === "main" ? "main" : "pr";
}

function repoSlug(env: Env): { owner: string; repo: string } {
	const raw = env.POLICAI_SIGNAL_GITHUB_REPO?.trim() || "l0cka/policai";
	const [owner, repo] = raw.split("/");
	if (!owner || !repo) {
		throw new Error("POLICAI_SIGNAL_GITHUB_REPO must be owner/repo");
	}
	return { owner, repo };
}

function signalBranchName(
	action: SignalCommitInput["action"],
	reviewId: string,
): string {
	return `signal/${action}-${reviewId}`.replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

function failure(code: SignalGitFailureCode, error: unknown): SignalGitFailure {
	return {
		ok: false,
		code,
		error: error instanceof Error ? error.message : String(error),
	};
}

export async function openSignalSnapshot(
	options: SignalSnapshotOptions = {},
): Promise<{ ok: true; snapshot: SignalSnapshot } | SignalGitFailure> {
	const env = options.env ?? process.env;
	const token = env.POLICAI_SIGNAL_GITHUB_TOKEN?.trim();
	if (!token) {
		return {
			ok: false,
			code: "github_token_unconfigured",
			error:
				"POLICAI_SIGNAL_GITHUB_TOKEN is not configured; Signal persists decisions only through GitHub, so nothing was applied.",
		};
	}
	const fetchImpl = options.fetchImpl ?? fetch;
	const target = commitTarget(env);

	let owner: string;
	let repo: string;
	try {
		({ owner, repo } = repoSlug(env));
	} catch (error) {
		return failure("github_unavailable", error);
	}
	const api = `/repos/${owner}/${repo}`;

	async function gh<T>(pathname: string, init: RequestInit = {}): Promise<T> {
		const method = init.method ?? "GET";
		const response = await fetchImpl(`https://api.github.com${pathname}`, {
			...init,
			method,
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2022-11-28",
				"Content-Type": "application/json",
			},
		});
		const text = await response.text();
		if (!response.ok) {
			throw new GitHubError(
				response.status,
				`GitHub ${method} ${pathname} failed (${response.status}): ${text.slice(0, 400)}`,
			);
		}
		return (text ? JSON.parse(text) : {}) as T;
	}

	function post<T>(pathname: string, body: unknown): Promise<T> {
		return gh<T>(pathname, { method: "POST", body: JSON.stringify(body) });
	}

	let baseSha: string;
	let baseTreeSha: string;
	try {
		baseSha = (await gh<GhRef>(`${api}/git/ref/heads/main`)).object.sha;
		baseTreeSha = (await gh<GhCommit>(`${api}/git/commits/${baseSha}`)).tree
			.sha;
	} catch (error) {
		return failure("github_unavailable", error);
	}

	async function load(relative: string): Promise<string | null> {
		const encodedPath = relative.split("/").map(encodeURIComponent).join("/");
		let file: GhContents | GhContents[];
		try {
			file = await gh<GhContents | GhContents[]>(
				`${api}/contents/${encodedPath}?ref=${baseSha}`,
			);
		} catch (error) {
			if (error instanceof GitHubError && error.status === 404) return null;
			throw error;
		}
		if (Array.isArray(file) || file.type !== "file") {
			throw new Error(`${relative} is not a file on main at ${baseSha}`);
		}
		const encoded =
			file.encoding === "base64" && file.content
				? file.content
				: (await gh<GhBlobContent>(`${api}/git/blobs/${file.sha}`)).content;
		return Buffer.from(encoded, "base64").toString("utf8");
	}

	async function createCommit(input: SignalCommitInput): Promise<string> {
		const tree = await Promise.all(
			input.changes.map(async (change) => {
				const blob = await post<GhSha>(`${api}/git/blobs`, {
					content: Buffer.from(change.content, "utf8").toString("base64"),
					encoding: "base64",
				});
				return {
					path: change.path,
					mode: "100644",
					type: "blob",
					sha: blob.sha,
				};
			}),
		);
		const newTree = await post<GhSha>(`${api}/git/trees`, {
			base_tree: baseTreeSha,
			tree,
		});
		const commit = await post<GhSha>(`${api}/git/commits`, {
			message: [
				`Signal: ${input.action} ${input.reviewId}`,
				"",
				input.message,
				"",
				input.attestationText,
			].join("\n"),
			tree: newTree.sha,
			parents: [baseSha],
		});
		return commit.sha;
	}

	async function commitToMain(
		input: SignalCommitInput,
	): Promise<SignalGitPersistResult> {
		const commitSha = await createCommit(input);
		try {
			await gh(`${api}/git/refs/heads/main`, {
				method: "PATCH",
				body: JSON.stringify({ sha: commitSha, force: false }),
			});
		} catch (error) {
			if (
				error instanceof GitHubError &&
				error.status === 422 &&
				/fast.forward/i.test(error.message)
			) {
				return {
					ok: false,
					code: "main_moved",
					error: `main moved after Signal read it at ${baseSha}; retry the request to decide against the new main`,
				};
			}
			throw error;
		}
		return {
			ok: true,
			target: "main",
			branch: "main",
			commitSha,
			htmlUrl: `https://github.com/${owner}/${repo}/commit/${commitSha}`,
		};
	}

	async function commitToPullRequest(
		input: SignalCommitInput,
	): Promise<SignalGitPersistResult> {
		const branch = signalBranchName(input.action, input.reviewId);
		const open = await gh<GhPull[]>(
			`${api}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
		);
		if (open.length > 0) {
			return {
				ok: true,
				target: "pr",
				branch,
				commitSha: open[0].head.sha,
				prUrl: open[0].html_url,
				htmlUrl: open[0].html_url,
				existing: true,
			};
		}

		const commitSha = await createCommit(input);
		try {
			await post(`${api}/git/refs`, {
				ref: `refs/heads/${branch}`,
				sha: commitSha,
			});
		} catch (error) {
			if (!(error instanceof GitHubError && error.status === 422)) throw error;
			await gh(`${api}/git/refs/heads/${branch}`, {
				method: "PATCH",
				body: JSON.stringify({ sha: commitSha, force: true }),
			});
		}

		const pull = await post<GhPull>(`${api}/pulls`, {
			title: `Signal: ${input.action} ${input.reviewId}`,
			head: branch,
			base: "main",
			body: [
				"## Summary",
				"",
				`Policai Signal decision: **${input.action}** \`${input.reviewId}\`, computed against main at \`${baseSha}\`.`,
				"",
				"## Attestation",
				"",
				"```",
				input.attestationText,
				"```",
				"",
				"Opened by the Signal HTTPS persistence path. Dan merges; the bot cannot merge.",
			].join("\n"),
		});
		return {
			ok: true,
			target: "pr",
			branch,
			commitSha,
			prUrl: pull.html_url,
			htmlUrl: pull.html_url,
		};
	}

	async function commit(
		input: SignalCommitInput,
	): Promise<SignalGitPersistResult> {
		try {
			return target === "main"
				? await commitToMain(input)
				: await commitToPullRequest(input);
		} catch (error) {
			return failure("github_persist_failed", error);
		}
	}

	return { ok: true, snapshot: { baseSha, load, commit } };
}
