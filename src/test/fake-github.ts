export interface FakeGitHubOptions {
	files: Record<string, string>;
	largeFiles?: string[];
	mainMovesOnPatch?: boolean;
	openPulls?: Array<{ html_url: string; number: number; head: { sha: string } }>;
	existingBranches?: string[];
}

interface FakeRequest {
	method: string;
	path: string;
	body?: unknown;
}

const API = "https://api.github.com/repos/l0cka/policai";
const BASE_SHA = "base-sha";
const BASE_TREE = "base-tree";

export function fakeGitHub(options: FakeGitHubOptions) {
	const requests: FakeRequest[] = [];
	const blobs = new Map<string, string>();
	const trees = new Map<
		string,
		{ base_tree: string; tree: Array<{ path: string; sha: string }> }
	>();
	const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
	const refs = new Map<string, string>([["heads/main", BASE_SHA]]);
	for (const branch of options.existingBranches ?? []) refs.set(`heads/${branch}`, "old");
	let counter = 0;

	const json = (data: unknown, status = 200) =>
		new Response(JSON.stringify(data), { status });

	const fetchImpl = async (url: string | URL, init?: RequestInit) => {
		const href = String(url);
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		if (!href.startsWith(API)) {
			return new Response(`unexpected host ${href}`, { status: 500 });
		}
		const pathname = href.slice(API.length);
		requests.push({ method, path: pathname, body });

		if (method === "GET" && pathname === "/git/ref/heads/main") {
			return json({ object: { sha: refs.get("heads/main") } });
		}
		if (method === "GET" && pathname === `/git/commits/${BASE_SHA}`) {
			return json({ sha: BASE_SHA, tree: { sha: BASE_TREE } });
		}
		const contents = pathname.match(/^\/contents\/(.+)\?ref=(.+)$/);
		if (method === "GET" && contents) {
			const file = decodeURIComponent(contents[1]);
			if (contents[2] !== BASE_SHA || !(file in options.files)) {
				return json({ message: "Not Found" }, 404);
			}
			const sha = `blob-of-${file}`;
			if (options.largeFiles?.includes(file)) {
				return json({ type: "file", sha, encoding: "none", content: "" });
			}
			return json({
				type: "file",
				sha,
				encoding: "base64",
				content: Buffer.from(options.files[file]).toString("base64"),
			});
		}
		const blobRead = pathname.match(/^\/git\/blobs\/blob-of-(.+)$/);
		if (method === "GET" && blobRead) {
			return json({
				encoding: "base64",
				content: Buffer.from(options.files[blobRead[1]]).toString("base64"),
			});
		}
		if (method === "POST" && pathname === "/git/blobs") {
			const sha = `new-blob-${++counter}`;
			blobs.set(sha, Buffer.from(body.content, "base64").toString("utf8"));
			return json({ sha }, 201);
		}
		if (method === "POST" && pathname === "/git/trees") {
			const sha = `new-tree-${++counter}`;
			trees.set(sha, body);
			return json({ sha }, 201);
		}
		if (method === "POST" && pathname === "/git/commits") {
			const sha = `new-commit-${++counter}`;
			commits.set(sha, body);
			return json({ sha, tree: { sha: body.tree } }, 201);
		}
		if (method === "PATCH" && pathname === "/git/refs/heads/main") {
			if (options.mainMovesOnPatch) {
				return json({ message: "Update is not a fast forward" }, 422);
			}
			refs.set("heads/main", body.sha);
			return json({ object: { sha: body.sha } });
		}
		if (method === "GET" && pathname.startsWith("/pulls?state=open&head=")) {
			return json(options.openPulls ?? []);
		}
		if (method === "POST" && pathname === "/git/refs") {
			const ref = String(body.ref).replace(/^refs\//, "");
			if (refs.has(ref)) {
				return json({ message: "Reference already exists" }, 422);
			}
			refs.set(ref, body.sha);
			return json({ ref: body.ref }, 201);
		}
		const refPatch = pathname.match(/^\/git\/refs\/(heads\/.+)$/);
		if (method === "PATCH" && refPatch) {
			refs.set(refPatch[1], body.sha);
			return json({ object: { sha: body.sha } });
		}
		if (method === "POST" && pathname === "/pulls") {
			return json(
				{
					html_url: "https://github.com/l0cka/policai/pull/999",
					number: 999,
					head: { sha: refs.get(`heads/${body.head}`) },
				},
				201,
			);
		}
		return new Response(`unexpected ${method} ${pathname}`, { status: 500 });
	};

	function committedFiles(commitSha: string): Record<string, string> {
		const commit = commits.get(commitSha);
		if (!commit) throw new Error(`no commit ${commitSha}`);
		const tree = trees.get(commit.tree);
		if (!tree) throw new Error(`no tree ${commit.tree}`);
		return Object.fromEntries(
			tree.tree.map((entry) => [entry.path, blobs.get(entry.sha) ?? ""]),
		);
	}

	return {
		fetchImpl: fetchImpl as unknown as typeof fetch,
		requests,
		refs,
		commits,
		trees,
		committedFiles,
		baseSha: BASE_SHA,
		baseTree: BASE_TREE,
	};
}
