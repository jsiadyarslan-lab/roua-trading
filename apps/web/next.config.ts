import type { NextConfig } from "next";

// API target for server-side rewrites:
// - Local dev:  http://localhost:3001 (default)
// - Docker:     http://api:3001       (via API_INTERNAL_URL build arg)
const apiTarget = process.env.API_INTERNAL_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: "/api/exchange/:path*",
        destination: `${apiTarget}/api/exchange/:path*`,
      },
      {
        source: "/api/ai/:path*",
        destination: `${apiTarget}/api/ai/:path*`,
      },
      {
        source: "/api/portfolio/:path*",
        destination: `${apiTarget}/api/portfolio/:path*`,
      },
      {
        source: "/api/signals/:path*",
        destination: `${apiTarget}/api/signals/:path*`,
      },
    ];
  },
};

export default nextConfig;
