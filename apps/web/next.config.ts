import type { NextConfig } from "next";
import TerserPlugin from "terser-webpack-plugin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const apiTarget = process.env.API_INTERNAL_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  // reactStrictMode enabled to detect memory leaks and side effects (BUG-002 fix)
  reactStrictMode: true,
  // SECURITY: Remove X-Powered-By header to prevent information disclosure
  poweredByHeader: false,
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@simplewebauthn/server',
  ],

  experimental: {
    optimizePackageImports: [
      'recharts',
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
  webpack(config, { isServer }) {
    if (!isServer && config.optimization) {
      config.optimization.concatenateModules = false;

      // Force lucide-react into its own chunk
      const existingSplitChunks = config.optimization.splitChunks as any;
      if (existingSplitChunks && existingSplitChunks.cacheGroups) {
        existingSplitChunks.cacheGroups.lucide = {
          test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
          name: 'lucide-react',
          chunks: 'all' as const,
          enforce: true,
        };
      }

      // Replace SWC minifier with Terser (compress but no mangle)
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
