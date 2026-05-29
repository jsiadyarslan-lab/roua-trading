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
      beforeFiles: [
        // PWA icons — rewrite to API route to bypass next-intl 307 redirect
        { source: '/icon-192.png', destination: '/api/pwa-asset?file=icon-192.png' },
        { source: '/icon-512.png', destination: '/api/pwa-asset?file=icon-512.png' },
        { source: '/apple-touch-icon.png', destination: '/api/pwa-asset?file=apple-touch-icon.png' },
        { source: '/logo-192.png', destination: '/api/pwa-asset?file=logo-192.png' },
        { source: '/logo-512.png', destination: '/api/pwa-asset?file=logo-512.png' },
        { source: '/favicon.ico', destination: '/api/pwa-asset?file=favicon.ico' },
        { source: '/favicon.svg', destination: '/api/pwa-asset?file=favicon.svg' },
        { source: '/offline.html', destination: '/api/pwa-asset?file=offline.html' },
      ],
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
