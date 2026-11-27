import type { NextConfig } from 'next';

const API = process.env.SCHEDULER_API ?? 'http://localhost:3000';

// The scheduler sends no CORS headers, deliberately — its own harness is served
// same-origin. Proxying keeps the browser same-origin here too.
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API}/api/v1/:path*` }];
  },
};

export default nextConfig;
