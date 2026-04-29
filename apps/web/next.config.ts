import type { NextConfig } from "next";
import TerserPlugin from "terser-webpack-plugin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Routing Architecture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CRITICAL routes → NestJS:
//   /api/trading/*, /api/signals/*, /api/portfolio/*
//
// LOCAL routes → Next.js:
//   /api/auth/*, /api/exchange/*, /api/alpaca/*, /api/ai/*, /api/news/*
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
  // "Cannot access 'X' before initialization" (scope conflict with minifier)
  experimental: {
    optimizePackageImports: [
      'recharts',
      'date-fns',
      'framer-motion',
    ],
  },

  // ── Fix: lucide-react minification crash ──
  // lucide-react defines ~1500 icon components in a barrel file.
  // When minified, variable names get reused across the same scope,
  // causing TDZ errors: "Cannot access 'X'/'J'/'K' before initialization".
  // Solution: compress code but skip mangling (keeps original var names).
  webpack(config, { isServer }) {
    if (!isServer && config.optimization) {
      config.optimization.concatenateModules = false;

      config.optimization.minimizer = [
        new TerserPlugin({
          terserOptions: {
            compress: true,
            mangle: false,
          },
          extractComments: false,
        }),
      ];
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
