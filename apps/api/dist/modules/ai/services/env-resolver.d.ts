import { ConfigService } from '@nestjs/config';
export declare function resolveEnvKey(configService: ConfigService, primaryName: string, alternateNames?: string[]): string;
export declare function reResolveKey(configService: ConfigService, currentKey: string, primaryName: string, alternateNames?: string[]): string;
