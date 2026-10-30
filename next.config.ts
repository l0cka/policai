import type { NextConfig } from "next";

// Set at origin so they hold whichever proxy sits in front. Every source is
// limited to this origin, except that scripts and styles keep 'unsafe-inline'
// for the theme and JSON-LD scripts and Next's inline bootstrap: a nonce
// would take every page off ISR and the static HTML assets. Cloudflare Web
// Analytics is the one third-party origin, in case the zone injects it.
// next dev evaluates modules with eval; production builds never do.
const DEV_EVAL = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'${DEV_EVAL} https://static.cloudflareinsights.com`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
	"connect-src 'self' https://cloudflareinsights.com",
	"worker-src 'self' blob:",
	"frame-src 'none'",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"object-src 'none'",
	"form-action 'self'",
	"upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
	{
		key: "Strict-Transport-Security",
		value: "max-age=31536000; includeSubDomains",
	},
	{
		key: "Content-Security-Policy",
		value: CONTENT_SECURITY_POLICY,
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
