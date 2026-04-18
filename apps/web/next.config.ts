import type { NextConfig } from "next";

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
        destination: "http://localhost:3001/api/exchange/:path*",
      },
      {
        source: "/api/ai/:path*",
        destination: "http://localhost:3001/api/ai/:path*",
      },
      {
        source: "/api/portfolio/:path*",
        destination: "http://localhost:3001/api/portfolio/:path*",
      },
      {
        source: "/api/signals/:path*",
        destination: "http://localhost:3001/api/signals/:path*",
      },
    ];
  },
};

export default nextConfig;
