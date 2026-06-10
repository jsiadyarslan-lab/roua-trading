# Phase 3, Feature 1: Intelligence Council Settings (إعدادات مجلس الذكاء)

## Task ID
Phase 3, Feature 1

## Agent
Code Agent

## Summary
Implemented admin-configurable Strategic Council parameters that were previously hardcoded as constants. The settings are saved to the DB `Setting` table and read by the Strategic Council service at runtime with a 60-second cache TTL.

## Files Modified

### 1. `/apps/web/src/lib/settings-validation.ts`
- Added `'councilConfig'` to `ALLOWED_ADMIN_CONFIG_KEYS` set
- Added `COUNCIL_CONFIG_RANGES` with 6 fields: `consensusThreshold`, `minBriefConfidence`, `dailyCostCapUsd`, `executorIntervalMin`, `agentIntervalMin`, `maxPairsPerSession`
- Added `else if (configKey === 'councilConfig') ranges = COUNCIL_CONFIG_RANGES` in `validateAdminConfig()`

### 2. `/apps/web/src/app/api/admin/settings/route.ts`
- Added `DEFAULT_COUNCIL_CONFIG` constant with default values
- Added `councilConfig` to GET handler: empty response, DB query, and JSON response
- Added `councilConfig` destructuring and validation in POST handler
- Added `sCouncilConfig` variable and upsert logic for councilConfig
- Added `councilConfig` to success log

### 3. `/apps/web/src/app/[locale]/dashboard/admin/settings/page.tsx`
- Added `Brain` to lucide-react imports
- Added `CouncilConfig` interface with 6 string fields
- Added `DEFAULT_COUNCIL_CONFIG` constant
- Added `councilConfig` state with `useState<CouncilConfig>`
- Added `if (data.councilConfig) setCouncilConfig(data.councilConfig)` in fetchSettings
- Added `councilConfig` to POST body in handleSave
- Added new Council Settings section card with Brain icon, Arabic header, description, and 6 range slider fields with purple/cyan color scheme

### 4. `/apps/api/src/modules/ai/strategic-council/strategic-council.service.ts`
- Added `_councilConfigCache` private field with 60-second TTL structure
- Added `_getCouncilConfig()` private method that reads from DB with fallback to hardcoded constants, cached with 60-second TTL
- Modified `runAgentSession()`: reads `maxPairsPerSession` from config, slices `BINANCE_SUPPORTED_PAIRS` accordingly
- Modified `runHourlySession()`: reads `dailyCostCapUsd` and `maxPairsPerSession` from config
- Modified `_analyzePairTimeframe()`: reads `consensusThreshold` from config instead of hardcoded `MIN_CONSENSUS_SCORE`
- Constants remain as fallback defaults (no imports removed)

## Verification
- API TypeScript compilation: PASS (0 errors)
- Web TypeScript compilation: No new errors (pre-existing errors unrelated to this change)
- Web lint: No new errors in changed files
- Cron decorators unchanged as required
- `executorIntervalMin` and `agentIntervalMin` are display/planning only (not used to change cron schedules)
