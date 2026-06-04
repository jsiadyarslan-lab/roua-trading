import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// With localePrefix: 'as-needed', the default locale (ar) works at root /,
// while non-default locales use prefixes: /en/dashboard, /fr/dashboard, etc.
// The [locale] dynamic segment in app router handles the locale resolution.
export default createMiddleware(routing);

export const config = {
  // Match all pathnames except:
  // - /api (API routes)
  // - /_next (Next.js internals)
  // - /static (static files)
  // - /socket.io (WebSocket)
  // - Common static file extensions
  matcher: ['/((?!api|_next|static|socket.io|pwa|.*\\..*).*)'],
};
