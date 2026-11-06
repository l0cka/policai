import type { NextConfig } from 'next';

// Set at origin so they hold whichever proxy sits in front. Every source is
// limited to this origin, except that scripts and styles keep 'unsafe-inline'
// for the theme script and Next's inline bootstrap (a nonce would need every
// page rendered per request), the sector map reads its style, tiles, glyphs and
// sprites from OpenFreeMap, and Cloudflare Web Analytics may be injected by the
// zone. The root site's policy (../../../next.config.ts) has the same shape.
// next dev evaluates modules with eval; production builds never do.
const DEV_EVAL = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV_EVAL} https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://tiles.openfreemap.org https://cloudflareinsights.com",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Content-Security-Policy',
    value: CONTENT_SECURITY_POLICY,
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // This package is independent of the parent repo's lockfile. Keep Docker's
  // standalone/server.js layout flat, whether checked out here or at /app.
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
