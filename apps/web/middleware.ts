import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except API routes, _next internals, static files, and socket.io
  matcher: ['/((?!api|_next|static|socket.io|.*\\..*).*)'],
};
