import type { NextConfig } from "next";

// Set at origin so they hold whichever proxy sits in front. The CSP leaves
// script, style and connect sources open: the inline theme and JSON-LD
// scripts, Next's own inline bootstrap and the map's tile and worker loads
// would each need a nonce or allow-list, and a nonce forces every page off
// ISR. These directives are the ones that cost nothing to enforce.
const SECURITY_HEADERS = [
	{
		key: "Strict-Transport-Security",
		value: "max-age=31536000; includeSubDomains",
	},
	{
		key: "Content-Security-Policy",
		value:
			"frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests",
	},
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
	},
];

const nextConfig: NextConfig = {
	poweredByHeader: false,

	async headers() {
		return [{ source: "/:path*", headers: SECURITY_HEADERS }];
	},

	// data-service resolves these files through runtime path parameters, which
	// Next's static dependency tracer cannot infer. Include them for every
	// server route so self-hosted ISR never serves without the canonical
	// register or collection metadata.
	outputFileTracingIncludes: {
		"/*": ["./data/**/*.json", "./public/data/**/*.json"],
	},

	async redirects() {
		return [
			// A zone redirect rule does this first on policai.org, because static
			// pages never reach this config (docs/hosting-argus.md). This copy
			// covers the pages the Worker renders and any other host.
			{
				source: "/:path*",
				has: [{ type: "host", value: "www.policai.org" }],
				destination: "https://policai.org/:path*",
				permanent: true,
			},
			{
				source: "/network",
				destination: "/coverage",
				permanent: true,
			},
			// Habit path for the developments Atom feed; canonical remains /feed.xml.
			{
				source: "/developments/feed.xml",
				destination: "/feed.xml",
				permanent: true,
			},
		];
	},
};

export default nextConfig;
