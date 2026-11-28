import type { NextConfig } from 'next';

// API calls go through app/api/v1/[...path]/route.ts, a runtime proxy that
// reads SCHEDULER_API per request, so no backend address is baked into the build.
const nextConfig: NextConfig = {
  // Self-contained server.js + minimal node_modules for a small runtime image.
  output: 'standalone',
};

export default nextConfig;
