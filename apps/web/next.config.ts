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
  // lucide-react defines hundreds of icon components as `const X = forwardRef(...)`.
  // When webpack's ModuleConcatenationPlugin merges them into one scope, the
  // minifier can't find enough unique single-letter variable names, causing
  // TDZ errors like "Cannot access 'X' before initialization".
  //
  // Fix 1: Disable module concatenation (prevents scope merging)
  // Fix 2: Use Terser with keep_fnames+keep_classnames (prevents name conflicts)
  webpack(config, { isServer }) {
    if (!isServer && config.optimization) {
      // Prevent webpack from merging lucide-react modules into same scope
      config.optimization.concatenateModules = false;

      // Use Terser instead of SWC minifier with safe name preservation
      config.optimization.minimizer = [
        new TerserPlugin({
          terserOptions: {
            compress: {
              keep_classnames: true,
              keep_fnames: true,
            },
            mangle: {
              keep_classnames: true,
              keep_fnames: true,
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
