import openNext from "./.open-next/worker.js";

// The data bundle in .open-next/assets/_bundled/ is the unfiltered editorial
// tree, read only through the ASSETS binding. wrangler.jsonc sends its public
// path here instead of the asset server, and this keeps it from OpenNext,
// which would otherwise serve it as a static file.
const worker = {
	fetch(request, env, ctx) {
		if (new URL(request.url).pathname.startsWith("/_bundled/")) {
			return new Response("Not found", { status: 404 });
		}
		return openNext.fetch(request, env, ctx);
	},
};

export default worker;
