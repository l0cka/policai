import path from "node:path";

// On Cloudflare Workers there is no project filesystem, so data files come
// from the module scripts/bundle-data.mjs generates at build time. Elsewhere
// this returns undefined and callers read the disk as before.
const onWorkers =
	typeof navigator !== "undefined" &&
	navigator.userAgent === "Cloudflare-Workers";

type Files = Readonly<Record<string, string>>;
let files: Promise<Files> | undefined;

function bundle(): Promise<Files> {
	files ??= import("@/lib/bundled-files.generated").then((m) => m.BUNDLED_FILES);
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
