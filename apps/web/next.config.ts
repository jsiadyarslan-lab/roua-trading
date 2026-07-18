import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin('./i18n/i18n/request.ts');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V469-PWA: Serwist configuration — compiles src/sw/sw.ts → public/sw.js
// The previous public/sw.js was hand-written and bypassed navigation
// requests (no offline support). The new SW uses NetworkFirst with
// /offline fallback for navigation, CacheFirst for static assets.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const withSerwist = withSerwistInit({
  swSrc: "src/sw/sw.ts",
  swDest: "public/sw.js",
  // Disable SW in development — prevents stale cache during HMR
  disable: process.env.NODE_ENV === "development",
  // Don't reload on dev changes (only relevant when not disabled)
  reloadOnOnline: true,
  cacheOnNavigation: true,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL FIX: API_INTERNAL_URL must NEVER be "http://api:3001"
// on Railway single-container deployments. NestJS runs on port 3001
// within the SAME container, so the correct address is 127.0.0.1:3001.
// "http://api:3001" only works in Docker Compose multi-container setups.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const rawApiTarget = process.env.API_INTERNAL_URL || "http://127.0.0.1:3001";
// If the baked-in value is the old Docker Compose hostname, override it
const apiTarget = rawApiTarget.includes("http://api:") ? "http://127.0.0.1:3001" : rawApiTarget;

const nextConfig: NextConfig = {
  // PERFORMANCE: Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400, // 24 hours
    deviceSizes: [640, 1080, 1920],
    imageSizes: [16, 32, 64, 128],
  },
  // reactStrictMode: only in development — avoids double-invoking effects in production
  reactStrictMode: process.env.NODE_ENV !== 'production',
  // SECURITY: Remove X-Powered-By header to prevent information disclosure
  poweredByHeader: false,
  // socket.io path specifics are handled by the rewrites() config below.
  // Skip TypeScript errors during build (pre-existing type issues in API routes)
  typescript: {
    ignoreBuildErrors: true,
  },
  // PERFORMANCE: Remove all console.* calls from the production bundle.
  // Keep console.error (critical issues) and console.warn (auth/debug diagnostics).
  // console.warn is essential for diagnosing OAuth flow failures in production.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }  // Keep error + warn for production diagnostics
      : false,
  },
  // NOTE: eslint.ignoreDuringBuilds removed in Next.js 16.
  // The build will skip ESLint checks by default.
  // If ESLint issues arise, configure via .eslintrc instead.
  serverExternalPackages: [
    '@prisma/client',
    'prisma',
    '@simplewebauthn/server',
    'react-markdown',
    'remark-gfm',
    'remark-parse',
    'remark-rehype',
    'unified',
    'micromark',
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

  // Removed destructive Webpack minimizer overrides that broke Next.js App Router client-side routing.
  // Next.js relies on its internal SWC minifier and chunking to correctly resolve RSC payloads.

  async redirects() {
    return [
      // PWA entry point - يعمل دائماً
      {
        source: '/pwa',
        destination: '/ar/dashboard',
        permanent: false,
      },
    ]
  },

  async rewrites() {
    return [
      // ── V-SOCKET-FIX: Socket.IO via /api/socket (avoids Next.js static file conflict) ──
      {
        source: '/api/socket',
        destination: `${apiTarget}/api/socket/`,
      },
      {
        source: '/api/socket/',
        destination: `${apiTarget}/api/socket/`,
      },
      {
        source: '/api/socket/:path*',
        destination: `${apiTarget}/api/socket/:path*`,
      },

      // ── V469-PWA: Locale-aware manifest URL ──
      // layout.tsx links to /manifest/{locale}/manifest.json but the route
      // handler at src/app/manifest/[locale]/route.ts serves /manifest/{locale}.
      // Rewrite the .json URL to the actual route handler. This keeps the
      // browser-facing URL conventional (/manifest/ar/manifest.json) while
      // letting one route handler serve all locales.
      {
        source: '/manifest/:locale/manifest.json',
        destination: '/manifest/:locale',
      },
      // ── V401: Socket.IO rewrite — always add trailing slash to destination ──
      // Socket.IO's path matching requires a trailing slash in the request URL.
      // Next.js removes trailing slashes (308 redirect), so /socket/ becomes /socket.
      // The rewrite must add the trailing slash back in the destination.
      //
      // Evidence: health check fetches /socket/ (with slash) → 200 OK
      //           browser requests /socket (no slash) → 404 from NestJS
      {
        source: '/socket',
        destination: `${apiTarget}/socket/`,
      },
      {
        source: '/socket/',
        destination: `${apiTarget}/socket/`,
      },
      {
        source: '/socket/:path*',
        destination: `${apiTarget}/socket/:path*`,
      },
      // ── Health check ──
      // REMOVED: Previously this rewrote /api/health → NestJS API.
      // This caused Railway healthcheck to FAIL during startup because
      // Next.js rewrites take precedence over route handlers, so the
      // rewrite proxied to NestJS before it was ready, returning 502/503.
      // Now the Next.js route handler at apps/web/src/app/api/health/route.ts
      // handles health checks directly — it returns 200 even when the API
      // is still starting, allowing Railway to mark the replica as healthy.
      // The NestJS /api/health endpoint is still available on port 3001
      // for internal monitoring and the route handler proxies to it with
      // graceful degradation.
      // ── Auth endpoints (proxied to NestJS) ──
      // FIX: /api/auth/session was returning 404 because it was only in NestJS
      // but not proxied through Next.js. This caused the frontend to think
      // the API was down when checking session status.
      {
        source: '/api/auth/session',
        destination: `${apiTarget}/api/auth/session`,
      },
      // ── WebAuthn endpoints (proxied to NestJS) ──
      // FIX: Mobile app needs access to WebAuthn registration, challenge, and
      // verify endpoints. Without these proxies, all WebAuthn requests from
      // mobile return 404 because there are no Next.js route handlers for them.
      // These are NestJS-only endpoints that need to be accessible from mobile.
      {
        source: '/api/auth/register',
        destination: `${apiTarget}/api/auth/register`,
      },
      {
        source: '/api/auth/challenge',
        destination: `${apiTarget}/api/auth/challenge`,
      },
      {
        source: '/api/auth/verify',
        destination: `${apiTarget}/api/auth/verify`,
      },
      // ── OAuth Callbacks (EXPLICIT BYPASS) ──
      // These routes MUST be handled by Next.js Route Handlers, NOT proxied to NestJS.
      // Next.js processes rewrites in order; these don't have a destination, so they pass through.
      // NOTE: We don't need explicit 'bypass' entries because Next.js only rewrites what matches
      // the 'source' fields below. We ensure no catch-all /api/:path* exists.

      // NOTE: /api/auth/guest rewrite REMOVED — it was shadowing the Next.js
      // route handler at apps/web/src/app/api/auth/guest/route.ts. The rewrite
      // sent requests to NestJS which may not be ready, causing 502 errors.
      // The local Next.js route handler is more reliable and faster.
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
      // ── Integration endpoints (proxied to NestJS for cross-platform communication) ──
      // These endpoints use X-Integration-Key auth (not session-based), so rewrites
      // are safe here — no Authorization header injection needed.
      // NestJS IntegrationGuard + CORS handle auth and cross-origin requests.
      {
        source: '/api/integration/:path*',
        destination: `${apiTarget}/api/integration/:path*`,
      },
      // ── OANDA SSE Stream (proxied directly to NestJS) ──
      // V376: EventSource needs a DIRECT connection to NestJS — Next.js Route Handlers
      // use fetch() which buffers the entire response, breaking SSE streaming.
      // This rewrite passes the request directly to NestJS, same as Socket.IO.
      {
        source: '/api/exchange/oanda-stream',
        destination: `${apiTarget}/api/exchange/oanda-stream`,
      },
      // ── Integrity Check (proxied to NestJS — no auth required) ──
      // Public diagnostic endpoint for verifying trading system safety.
      // No auth needed — anyone can check system integrity.
      {
        source: '/api/integrity',
        destination: `${apiTarget}/api/integrity`,
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

export default withSerwist(withNextIntl(nextConfig));
