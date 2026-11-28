import type { NextConfig } from 'next';

const API = process.env.SCHEDULER_API ?? 'http://localhost:3000';

// The scheduler sends no CORS headers, deliberately — its own harness is served
// same-origin. Proxying keeps the browser same-origin here too.
//
// Rewrites are resolved at build time, so SCHEDULER_API must be set when the
// image is built (see Dockerfile). In Kubernetes the ingress also routes
// /api/v1 straight to the API, so the browser never depends on this proxy there.
const nextConfig: NextConfig = {
  // Self-contained server.js + minimal node_modules for a small runtime image.
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API}/api/v1/:path*` }];
  },
};

export default nextConfig;
