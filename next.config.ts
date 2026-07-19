import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// data-service resolves these files through runtime path parameters, which
	// Next's static dependency tracer cannot infer. Include them for every
	// server route so Vercel functions and ISR never deploy without the
	// canonical register or collection metadata.
	outputFileTracingIncludes: {
		"/*": ["./data/**/*.json", "./public/data/**/*.json"],
	},
};

export default nextConfig;
