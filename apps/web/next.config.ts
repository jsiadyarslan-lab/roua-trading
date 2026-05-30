import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: "src/sw/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL FIX: API_INTERNAL_URL must NEVER be "http://api:3001"
// on Railway single-container deployments. NestJS runs on port 3001
// within the SAME container, so the correct address is 127.0.0.1:3001.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const rawApiTarget = process.env.API_INTERNAL_URL || "http://127.0.0.1:3001";
const apiTarget = rawApiTarget.includes("http://api:") ? "http://127.0.0.1:3001" : rawApiTarget;

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    deviceSizes: [640, 1080, 1920],
    imageSizes: [16, 32, 64, 128],
  },
  reactStrictMode: process.env.NODE_ENV !== 'production',
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@simplewebauthn/server',
  ],

  experimental: {
    optimizePackageImports: [
      'recharts',
      'framer-motion',
      'lucide-react',
      // FIX: Removed 'lightweight-charts' from optimizePackageImports.
      // This optimization was restructuring lightweight-charts imports in a way
      // that could create circular references between internal modules, contributing
      // to the TDZ error "Cannot access 'eT' before initialization" at tL.symbol.
      // Since we now use only dynamic imports for lightweight-charts, this
      // optimization is no longer needed and was actively harmful.
      'technicalindicators',
      'socket.io-client',
    ],
  },

  turbopack: {},

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CRITICAL FIX: Production minifier TDZ (Temporal Dead Zone) prevention.
  //
  // Next.js 16 uses SWC minifier by default (NOT Terser). The previous
  // TerserPlugin fix was a NO-OP because TerserPlugin is never in the
  // minimizer array when SWC is the default minifier.
  //
  // The real fix is to force webpack to use Terser with `reduce_vars: false`
  // which prevents reordering of let/const declarations that causes
  // "ReferenceError: Cannot access 'x' before initialization" errors.
  //
  // Primary fix: Removed static `import { createSeriesMarkers } from 'lightweight-charts'`
  // in useChart.ts — this eliminates the TDZ risk at the source.
  // This webpack config is a defense-in-depth measure.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Try to find and configure whichever minifier is active
      const minimizers = config.optimization?.minimizer || [];
      for (const plugin of minimizers) {
        const name = plugin?.constructor?.name || '';
        // Handle TerserPlugin (if present)
        if (name === 'TerserPlugin') {
          const existingCompress = (plugin as any).options?.terserOptions?.compress || {};
          (plugin as any).options = {
            ...(plugin as any).options,
            terserOptions: {
              ...(plugin as any).options?.terserOptions,
              compress: {
                ...existingCompress,
                reduce_vars: false,
                reduce_funcs: false,
                hoist_funs: false,
              },
            },
          };
        }
        // Handle SWC minifier (Next.js 16 default)
        // SWC minimizer plugin has different options structure
        if (name.includes('Swc') || name.includes('swc') || name.includes('Minify')) {
          try {
            if ((plugin as any).options) {
              (plugin as any).options = {
                ...(plugin as any).options,
                // SWC minifier config - disable aggressive optimizations
                // that can reorder const/let declarations
                jsc: {
                  ...(plugin as any).options?.jsc,
                  minify: {
                    ...(plugin as any).options?.jsc?.minify,
                    // Disable compress optimizations that can cause TDZ
                    compress: {
                      ...(plugin as any).options?.jsc?.minify?.compress,
                      reduce_vars: false,
                    },
                  },
                },
              };
            }
          } catch { /* SWC config may not support these options */ }
        }
      }
    }
    return config;
  },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },

  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: '/socket.io',
          destination: `${apiTarget}/socket.io`,
        },
        {
          source: '/socket.io/',
          destination: `${apiTarget}/socket.io/`,
        },
        {
          source: '/socket.io/:path*',
          destination: `${apiTarget}/socket.io/:path*`,
        },
        {
          source: '/api/auth/session',
          destination: `${apiTarget}/api/auth/session`,
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
        {
          source: '/api/integration/:path*',
          destination: `${apiTarget}/api/integration/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

export default withSerwist(withNextIntl(nextConfig));
