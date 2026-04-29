import type { NextConfig } from "next";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Routing Architecture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const apiTarget = process.env.API_INTERNAL_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@simplewebauthn/server',
  ],

  // NOTE: lucide-react removed from optimizePackageImports — it causes
  // TDZ errors when barrel file icons share minified scope with other libs
  experimental: {
    optimizePackageImports: [
      'recharts',
      'date-fns',
      'framer-motion',
    ],
  },

  // ── Fix: lucide-react TDZ crash ──
  // Root cause: lucide-react's barrel file defines ~1500 icon variables.
  // When webpack bundles them into the same chunk as React/Radix internals,
  // the minifier creates TDZ errors (e.g. "Cannot access 'X' before initialization").
  //
  // Fix: Split lucide-react into its own chunk so its variables
  // are isolated from React/Radix/other framework code.
  webpack(config, { isServer }) {
    if (!isServer && config.optimization) {
      config.optimization.concatenateModules = false;

      // Force lucide-react into its own chunk to prevent TDZ conflicts
      const existingSplitChunks = config.optimization.splitChunks as any;
      if (existingSplitChunks && existingSplitChunks.cacheGroups) {
        existingSplitChunks.cacheGroups.lucide = {
          test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
          name: 'lucide-react',
          chunks: 'all' as const,
          enforce: true,
        };
      }
    }
    return config;
  },

  async rewrites() {
    return [
      {
        source: '/api/health',
        destination: `${apiTarget}/api/health`,
      },
      {
        source: '/api/news/nest/latest',
        destination: `${apiTarget}/api/news/latest`,
      },
      {
        source: '/api/news/nest/analyze',
        destination: `${apiTarget}/api/news/analyze`,
      },
      {
        source: '/api/news/nest/fetch',
        destination: `${apiTarget}/api/news/fetch`,
      },
    ];
  },
};

export default nextConfig;
