import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Data only changes through commits, and every commit redeploys, so pages are
// served as prerendered at build time. A page past its `revalidate` would
// render the same bytes again, so revalidation is dropped rather than queued.
export default defineCloudflareConfig({
	incrementalCache: staticAssetsIncrementalCache,
	queue: { name: "none", send: async () => {} },
	enableCacheInterception: true,
});
