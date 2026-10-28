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
		if (url.pathname.startsWith("/_rsc/")) {
			url.pathname = url.pathname.slice("/_rsc".length);
			request = new Request(url, request);
		}
		if (url.pathname.startsWith("/_bundled/")) {
			return new Response("Not found", { status: 404 });
		}
		return openNext.fetch(request, env, ctx);
	},

	// Prerendered pages that count from today (/this-week) are only as fresh
	// as the last deploy, and a stalled collection means no deploy. The crons
	// in wrangler.jsonc fire at 13:05 and 14:05 UTC; whichever is 00:05 in
	// Sydney that season rebuilds main through a Workers Builds deploy hook,
	// whose URL is the DEPLOY_HOOK_URL secret.
	async scheduled(controller, env) {
		const hour = new Intl.DateTimeFormat("en-AU", {
			timeZone: "Australia/Sydney",
			hour: "numeric",
			hourCycle: "h23",
		}).format(controller.scheduledTime);
		if (Number(hour) !== 0) return;
		if (!env.DEPLOY_HOOK_URL) throw new Error("nightly rebuild: no DEPLOY_HOOK_URL secret");
		const response = await fetch(env.DEPLOY_HOOK_URL, { method: "POST" });
		if (!response.ok) throw new Error(`nightly rebuild: deploy hook answered ${response.status}`);
	},
};

export default worker;
