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
      'lightweight-charts',
      'technicalindicators',
      'socket.io-client',
    ],
  },

  turbopack: {},

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CRITICAL FIX: Terser minifier TDZ (Temporal Dead Zone) prevention.
  //
  // In production builds, Terser's `reduce_vars` optimization can reorder
  // let/const declarations, causing "ReferenceError: Cannot access 'x' before
  // initialization" at runtime. This has already caused 3 separate crashes:
  //   1. lastAnalysisResultRef TDZ → moved declaration higher in component
  //   2. tfSeconds useMemo TDZ → converted to useRef
  //   3. Current: "Cannot access 'eT' before initialization" at tL.symbol
  //
  // Root cause: Terser's `reduce_vars` tracks variable values and substitutes
  // them earlier in the code, which can break the temporal ordering of
  // let/const declarations. Disabling `reduce_vars` prevents this class of
  // bugs entirely with minimal bundle size impact (~1-2% increase).
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      const terserPlugin = config.optimization?.minimizer?.find(
        (plugin: any) => plugin?.constructor?.name === 'TerserPlugin'
      );
      if (terserPlugin) {
        const existingCompress = terserPlugin.options?.terserOptions?.compress || {};
        terserPlugin.options = {
          ...terserPlugin.options,
          terserOptions: {
            ...terserPlugin.options?.terserOptions,
            compress: {
              ...existingCompress,
              // Prevent Terser from reordering let/const declarations
              // which causes TDZ errors in production builds
              reduce_vars: false,
              reduce_funcs: false,
              // Prevent hoisting of function declarations past let/const
              hoist_funs: false,
            },
          },
        };
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
