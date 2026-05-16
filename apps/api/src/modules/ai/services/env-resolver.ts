/**
 * Environment Variable Resolver — Reliable key resolution that works
 * even during NestJS service construction when ConfigService.get()
 * may return empty values.
 *
 * Resolution order:
 * 1. ConfigService.get() (NestJS managed)
 * 2. process.env direct access (always available)
 * 3. Alternate env var names
 */

import { ConfigService } from '@nestjs/config';

export function resolveEnvKey(
  configService: ConfigService,
  primaryName: string,
  alternateNames: string[] = [],
): string {
  const env = process.env as Record<string, string | undefined>;

  // Try ConfigService first
  const configValue = configService.get<string>(primaryName, '')?.trim() || '';
  if (configValue) return configValue;

  // Try process.env directly
  const envValue = env[primaryName]?.trim() || '';
  if (envValue) return envValue;

  // Try alternate names
  for (const altName of alternateNames) {
    const altConfig = configService.get<string>(altName, '')?.trim() || '';
    if (altConfig) return altConfig;

    const altEnv = env[altName]?.trim() || '';
    if (altEnv) return altEnv;
  }

  return '';
}

/**
 * Re-resolve a key on-demand (call on every analyze() if key was empty at construction)
 */
export function reResolveKey(
  configService: ConfigService,
  currentKey: string,
  primaryName: string,
  alternateNames: string[] = [],
): string {
  if (currentKey) return currentKey; // Already resolved
  return resolveEnvKey(configService, primaryName, alternateNames);
}
