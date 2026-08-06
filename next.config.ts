import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// data-service resolves these files through runtime path parameters, which
	// Next's static dependency tracer cannot infer. Include them for every
	// server route so self-hosted ISR never serves without the canonical
	// register or collection metadata.
	outputFileTracingIncludes: {
		"/*": ["./data/**/*.json", "./public/data/**/*.json"],
	},

	async redirects() {
		return [
			// The tunnel answers for both hostnames, so the canonical choice is
			// made here rather than as a Cloudflare rule: it stays visible in the
			// repository and survives a move between hosts.
			{
				source: "/:path*",
				has: [{ type: "host", value: "www.policai.org" }],
				destination: "https://policai.org/:path*",
				permanent: true,
			},
		];
	},
};

export default nextConfig;
