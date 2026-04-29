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
  // "Cannot access 'X' before initialization" (SWC minifier scope conflict)
  experimental: {
    optimizePackageImports: [
      'recharts',
      'date-fns',
      'framer-motion',
    ],
  },

  // ── Override SWC minifier with Terser for client bundles ──
  // SWC minifier creates a variable 'X' that conflicts with
  // lucide-react's X icon class, causing:
  //   ReferenceError: Cannot access 'X' before initialization
  // Terser does not have this bug.
  webpack(config, { isServer }) {
    if (!isServer && config.optimization) {
      config.optimization.minimizer = [
        new TerserPlugin({
          terserOptions: {
            compress: {
              // Keep class names to prevent variable name conflicts
              // (e.g. lucide-react's X icon class vs minifier's X variable)
              keep_classnames: true,
            },
            mangle: {
              // Keep class names but mangle everything else
              keep_classnames: true,
            },
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
