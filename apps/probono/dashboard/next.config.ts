import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // This package is independent of the parent repo's lockfile. Keep Docker's
  // standalone/server.js layout flat, whether checked out here or at /app.
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
};

export default nextConfig;
