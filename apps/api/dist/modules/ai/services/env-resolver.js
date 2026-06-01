"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEnvKey = resolveEnvKey;
exports.reResolveKey = reResolveKey;
function resolveEnvKey(configService, primaryName, alternateNames = []) {
    const env = process.env;
    const configValue = configService.get(primaryName, '')?.trim() || '';
    if (configValue)
        return configValue;
    const envValue = env[primaryName]?.trim() || '';
    if (envValue)
        return envValue;
    for (const altName of alternateNames) {
        const altConfig = configService.get(altName, '')?.trim() || '';
        if (altConfig)
            return altConfig;
        const altEnv = env[altName]?.trim() || '';
        if (altEnv)
            return altEnv;
    }
    return '';
}
function reResolveKey(configService, currentKey, primaryName, alternateNames = []) {
    if (currentKey)
        return currentKey;
    return resolveEnvKey(configService, primaryName, alternateNames);
}
//# sourceMappingURL=env-resolver.js.map