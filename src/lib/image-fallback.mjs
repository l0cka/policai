// The Images binding throws when Cloudflare cannot transform an image, which
// turned every /_next/image request into a 500 for five hours on 6 Nov 2026.
// The page still needs its picture, so serve the stored original instead.
export async function withOriginalImageFallback(optimize, request, env) {
	try {
		return await optimize();
	} catch (error) {
		const source = new URL(request.url).searchParams.get("url");
		if (!source?.startsWith("/") || source.startsWith("//")) throw error;
		console.error("image optimization failed, serving the original", source, error);
		return env.ASSETS.fetch(new URL(source, request.url));
	}
}
