import openNext from "./.open-next/worker.js";

// The data bundle in .open-next/assets/_bundled/ is the unfiltered editorial
// tree, read only through the ASSETS binding. wrangler.jsonc sends its public
// path here instead of the asset server, and this keeps it from OpenNext,
// which would otherwise serve it as a static file.
//
// Prerendered pages are static assets (scripts/static-pages.mjs), so a zone
// URL rewrite moves Next client navigations (RSC: 1) under /_rsc/ to reach
// the Worker, which renders their payload; the prefix comes off here.
const worker = {
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/_bundled/")) {
			return new Response("Not found", { status: 404 });
		}
		if (url.pathname.startsWith("/_rsc/")) {
			url.pathname = url.pathname.slice("/_rsc".length);
			return openNext.fetch(new Request(url, request), env, ctx);
		}
		return openNext.fetch(request, env, ctx);
	},
};

export default worker;
