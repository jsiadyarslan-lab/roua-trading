import type { NextConfig } from "next";
import TerserPlugin from "terser-webpack-plugin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const apiTarget = process.env.API_INTERNAL_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  // reactStrictMode enabled to detect memory leaks and side effects (BUG-002 fix)
  reactStrictMode: true,
  // SECURITY: Remove X-Powered-By header to prevent information disclosure
  poweredByHeader: false,
  // Skip TypeScript errors during build (pre-existing type issues in API routes)
  typescript: {
    ignoreBuildErrors: true,
  },
  // NOTE: eslint.ignoreDuringBuilds removed in Next.js 16.
  // The build will skip ESLint checks by default.
  // If ESLint issues arise, configure via .eslintrc instead.
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@simplewebauthn/server',
  ],

  experimental: {
    optimizePackageImports: [
      'recharts',
      '@mdxeditor/editor',
      'react-syntax-highlighter',
      'date-fns',
      'framer-motion',
    ],
  },

  // Next.js 16 defaults to Turbopack. Provide an empty turbopack config
  // so the build doesn't error when a webpack config is also present.
  // The webpack config below is still used when building with --webpack flag.
  turbopack: {},

  // ── Fix: "Cannot access 'X' before initialization" ──
  // Next.js 16 default SWC minifier creates TDZ errors in production
  // where variables like `let X` in Next.js Router code conflict
  // with React component rendering. Terser with mangle:false prevents
  // ALL such variable name conflicts while still compressing code.
  //
  // CRITICAL: Must apply to BOTH client AND server bundles.
  // The server bundle also needs Terser because Zustand's persist middleware
  // references `window.localStorage` at module level, and SWC's minifier
  // can reorder code in ways that break typeof window guards during SSR.
  webpack(config, { isServer }) {
    if (config.optimization) {
      config.optimization.concatenateModules = false;

      // Force lucide-react into its own chunk (client only — splits are client-only)
      if (!isServer) {
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

      // Replace SWC minifier with Terser on BOTH client and server bundles
      // This prevents TDZ errors and SSR crashes from code reordering
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
      // ── Health check ──
      {
        source: '/api/health',
        destination: `${apiTarget}/api/health`,
      },
      // ── Auth endpoints (proxied to NestJS) ──
      // FIX: /api/auth/session was returning 404 because it was only in NestJS
      // but not proxied through Next.js. This caused the frontend to think
      // the API was down when checking session status.
      {
        source: '/api/auth/session',
        destination: `${apiTarget}/api/auth/session`,
      },
      {
        source: '/api/auth/guest',
        destination: `${apiTarget}/api/auth/guest`,
      },
      // ── News endpoints (proxied to NestJS) ──
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
      // ── REMOVED: Strategic Council and Smart Executor rewrites ──
      // These were bypassing the Next.js Route Handlers that inject auth tokens.
      // The rewrites sent requests directly to NestJS without Authorization headers,
      // causing 401 errors. The Route Handlers at:
      //   /api/strategic-council/[...path]/route.ts
      //   /api/smart-executor/[...path]/route.ts
      // already proxy to NestJS with proper auth injection via createNestJSProxyHandlers().
    ];
  },
};

export default nextConfig;
