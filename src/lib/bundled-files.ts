import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// On Cloudflare Workers there is no project filesystem, so data files come
// from the static asset scripts/bundle-data.mjs writes at build time. It is
// also public at /_bundled/files.json, like the repository it copies.
// Elsewhere this returns undefined and callers read the disk as before.
const onWorkers =
	typeof navigator !== "undefined" &&
	navigator.userAgent === "Cloudflare-Workers";

const BUNDLE_URL = "https://assets.invalid/_bundled/files.json";

type Files = Readonly<Record<string, string>>;
let files: Promise<Files> | undefined;

async function fetchBundle(): Promise<Files> {
	const { env } = await getCloudflareContext({ async: true });
	if (!env.ASSETS) throw new Error("bundled data: no ASSETS binding");
	const response = await env.ASSETS.fetch(BUNDLE_URL);
	if (!response.ok) throw new Error(`bundled data: ${BUNDLE_URL} answered ${response.status}`);
	return response.json();
}

function bundle(): Promise<Files> {
	files ??= fetchBundle().catch((error) => {
		files = undefined;
		throw error;
	});
	return files;
}

function repoRelative(filePath: string): string {
	return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join("/");
}

export async function readBundledFile(
	filePath: string,
): Promise<string | null | undefined> {
	if (!onWorkers) return undefined;
	return (await bundle())[repoRelative(filePath)] ?? null;
}

export async function listBundledDir(
	dir: string,
): Promise<string[] | undefined> {
	if (!onWorkers) return undefined;
	const prefix = `${repoRelative(dir)}/`;
	return Object.keys(await bundle())
		.filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
		.map((key) => key.slice(prefix.length));
}
