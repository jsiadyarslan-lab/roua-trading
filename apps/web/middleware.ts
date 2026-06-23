/**
 * middleware.ts — Next.js 16 entry point.
 *
 * In Next.js 16, proxy.ts is the official middleware file.
 * This file re-exports proxy() as default so that Next.js picks it up
 * correctly. The actual logic lives in src/proxy.ts.
 *
 * If both proxy.ts and middleware.ts exist, Next.js 16 uses proxy.ts.
 * This file exists for backward compatibility with next-intl tooling.
 */
export { proxy as default, config } from '../src/proxy';
