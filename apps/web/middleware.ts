import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except:
  // - API routes (/api/*)
  // - _next internals (/_next/*)
  // - Static files (/static/*)
  // - Socket.IO (/socket.io/*)
  // - Public assets with file extensions (.png, .jpg, .svg, .ico, .json, .js, .css, .woff, etc.)
  // - Service Worker and Manifest
  matcher: ['/((?!api|_next|static|socket.io|sw\\.js|manifest\\.json|.*\\.(png|jpg|jpeg|gif|svg|ico|webp|avif|json|js|css|woff|woff2|ttf|eot|otf|mp3|mp4|pdf|xml|txt|webmanifest)).*)'],
};
