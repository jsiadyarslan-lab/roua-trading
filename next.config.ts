import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      'recharts',
      '@mdxeditor/editor',
      'lucide-react',
      'technicalindicators',
    ],
  },
  async headers() {
    return [
      {
        // CRITICAL FIX: Prevent CDN from caching pages for 1 year.
        // Next.js static pages default to s-maxage=31536000 (1 year),
        // which means code changes NEVER reach users until cache expires.
        // With s-maxage=0 and must-revalidate, every request checks the
        // origin for fresh content. This is essential for a trading platform
        // where stale UI = stale prices = wrong trades.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Cache-Control', value: 'public, s-maxage=0, must-revalidate' },
        ],
      },
      {
        // API routes: never cache (live data — prices, positions, etc.)
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
