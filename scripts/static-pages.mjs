// Copies every page prerendered at build time into .open-next/assets after the
// Cloudflare build, so Cloudflare serves it as a static file without starting
// the Worker. The Worker serves these exact bytes from its cache anyway
// (open-next.config.ts drops revalidation), but on a quiet site nearly every
// visit started a fresh Worker first, at 0.5 to 0.9 s, where an asset answers
// in about 0.1 s.
//
// The asset server ignores headers and query strings, so a Next client
// navigation (RSC: 1, ?_rsc=) would get this HTML instead of its payload. A
// zone URL rewrite sends those to /_rsc/..., which runs the Worker; see
// worker.mjs and docs/architecture.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const APP = ".next/server/app";
const ASSETS = ".open-next/assets";

const manifest = JSON.parse(await readFile(".next/prerender-manifest.json", "utf8"));
let pages = 0;
for (const route of Object.keys(manifest.routes)) {
	const base = path.join(APP, route === "/" ? "index" : route);
	let html, meta;
	try {
		html = await readFile(`${base}.html`);
		meta = JSON.parse(await readFile(`${base}.meta`, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") continue; // a route handler, not a page
		throw error;
	}
	// Redirects and notFound() pages keep their status from the Worker.
	if ((meta.status ?? 200) !== 200) continue;
	const out = path.join(ASSETS, `${route === "/" ? "index" : route}.html`);
	await mkdir(path.dirname(out), { recursive: true });
	await writeFile(out, html);
	pages++;
}

// Assets skip next.config's headers(), so they are restated for the asset
// server. Next lets a later rule override a header; the asset server instead
// joins repeated headers with a comma. Only Content-Security-Policy repeats,
// and a comma-joined CSP enforces every policy, so a narrower rule can only
// tighten it, which is what it is for.
const { headers } = JSON.parse(await readFile(".next/routes-manifest.json", "utf8"));
const rules = headers.map((rule) => {
	const prefix = rule.source.match(/^(\/[^:]*?)\/?:path\*$/)?.[1];
	if (prefix === undefined || rule.has || rule.missing) {
		throw new Error(`static-pages: cannot restate header rule ${rule.source} in _headers`);
	}
	const lines = rule.headers.map(({ key, value }) => `  ${key}: ${value}`).join("\n");
	const paths = prefix === "/" || prefix === "" ? ["/*"] : [prefix, `${prefix}/*`];
	return paths.map((p) => `${p}\n${lines}\n`).join("");
});
await writeFile(path.join(ASSETS, "_headers"), rules.join(""));

console.log(`static-pages: ${pages} pages -> ${ASSETS}`);
