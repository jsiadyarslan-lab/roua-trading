import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// With localePrefix: 'never', the middleware only handles locale detection
// from cookies/headers. It does NOT add any prefix to URLs.
// This is safe because there is no [locale] route segment structure.
export default createMiddleware(routing);

export const config = {
  // Match all pathnames except:
  // - /api (API routes)
  // - /_next (Next.js internals)
  // - /static (static files)
  // - /socket.io (WebSocket)
  // - Common static file extensions
  matcher: ['/((?!api|_next|static|socket.io|.*\\..*).*)'],
};
