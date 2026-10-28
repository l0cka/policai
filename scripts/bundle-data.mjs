// Writes .open-next/assets/_bundled/files.json after the Cloudflare build: the
// repository data files the site reads at request time, keyed by
// repo-relative path. A Worker has no project filesystem, so it reads them
// from this asset through the ASSETS binding. As a module they were compiled
// into two server chunks, adding about 10 MB to the Worker script.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOTS = [
	{ dir: "data", match: /\.(json|md)$/ },
	{ dir: "public/data", match: /\.json$/ },
];
const OUT = ".open-next/assets/_bundled/files.json";

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const full = path.join(dir, entry.name);
			return entry.isDirectory() ? walk(full) : [full];
		}),
	);
	return nested.flat();
}

const files = {};
for (const { dir, match } of ROOTS) {
	for (const file of (await walk(dir)).filter((name) => match.test(name)).sort()) {
		files[file.split(path.sep).join("/")] = await readFile(file, "utf8");
	}
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(files));
console.log(`bundle-data: ${Object.keys(files).length} files -> ${OUT}`);
