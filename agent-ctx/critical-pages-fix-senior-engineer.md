# Task: Fix Signals and Settings Pages — Critical Data Integrity Fix

## Summary
Fixed two critical pages in the ROUA Trading Platform that were displaying fabricated/hardcoded data to users.

## Changes Made

### 1. Prisma Schema — New `Setting` Model
- **File**: `prisma/schema.prisma`
- Added `Setting` model (key-value store) for system settings persistence
- Fields: `id`, `key` (unique), `value` (JSON string), `updatedAt`, `createdAt`

### 2. DB Safety-Net Migrations
- **File**: `apps/web/src/lib/db.ts`
- Added CREATE TABLE IF NOT EXISTS for `Setting` table and its indexes

### 3. Signals Stats API (NEW)
- **File**: `apps/web/src/app/dashboard/admin/api/signals/stats/route.ts`
- GET endpoint that queries `db.signal` for:
  - Signal counts by status (ACTIVE, EXPIRED, EXECUTED, CANCELLED)
  - Win rate calculated from trades linked to executed signal orders
  - Average confidence across all signals
  - Average return per signal from trade PnL
  - Best/worst performing pairs by average confidence
- Returns zeros if DB unavailable — NO fake data

### 4. Signals Page Fix
- **File**: `apps/web/src/app/dashboard/admin/signals/page.tsx`
- **REMOVED**: Catch blocks that injected fabricated signals/scanner data (5 fake signals, 8 fake scanner results)
- **ADDED**: `signalsError` and `scannerError` state tracking
- **ADDED**: Error banner at top of page showing "فشل في جلب البيانات من الخادم" with details
- **ADDED**: Empty state messages when data is unavailable
- **REPLACED**: Hardcoded "أداء الإشارات" section (68.5%, +2.3%, BTC/USD +12.4%, EUR/USD -3.1%) with real data from `/dashboard/admin/api/signals/stats`
- **ADDED**: Loading skeleton for stats section
- **FIXED**: API response handling to support both `data.signals` and `data.data` formats from `/api/signals/smart`
- **FIXED**: Scanner fallback detection — shows "⚠️ بيانات تجريبية" when API returns `meta.source === 'fallback'`

### 5. Settings API (NEW)
- **File**: `apps/web/src/app/dashboard/admin/api/settings/route.ts`
- **GET**: Returns all system settings from `Setting` table as JSON
  - Reads botConfig, riskConfig, platformConfig from DB
  - Fetches real API keys from `ExchangeCredential` and `ApiKey` models
  - Returns defaults if DB unavailable
  - Masks API keys for display (first 2 + last 4 chars)
- **POST**: Saves settings to DB via upsert by key
  - Accepts: `{ botConfig?, riskConfig?, platformConfig? }`
  - Returns success/error feedback

### 6. Settings Page Fix
- **File**: `apps/web/src/app/dashboard/admin/settings/page.tsx`
- **REMOVED**: Hardcoded API keys (`PK••••••••3F2A`, `BN••••••••8D4C`, `TD••••••••1A7B`)
- **REMOVED**: Local-only `handleSave()` that just set `saved=true`
- **ADDED**: `fetchSettings()` on load — calls GET `/dashboard/admin/api/settings`
- **ADDED**: Real `handleSave()` — calls POST `/dashboard/admin/api/settings` with all config data
- **ADDED**: Loading state with spinner during initial fetch
- **ADDED**: Error banners for load failures and save failures
- **ADDED**: Save loading state ("جارٍ الحفظ...") with spinner
- **ADDED**: Real API keys section — fetches from `ExchangeCredential` and `ApiKey` models
- **ADDED**: "ميزة قيد التطوير" note when no API keys exist
- **ADDED**: "إضافة مفتاح API جديد" button now opens a modal with form fields:
  - Exchange selector (Alpaca, Binance, Twelve Data, Coinbase, Interactive Brokers)
  - API Key input
  - API Secret input (password field)
  - Label (optional)
  - Development warning banner
- **ADDED**: Refresh button to reload settings from server
- **ADDED**: Formatted lastValidated timestamps (relative time in Arabic)

## Key Design Decisions
1. **Zero fake data policy**: All API endpoints return zeros/empty when DB is unavailable
2. **Error visibility**: Clear Arabic error banners so users know when data is unavailable
3. **API key masking**: Never expose full keys — only first 2 + last 4 characters
4. **Graceful degradation**: Pages still render with defaults even when backend is down
5. **Settings persistence**: Using key-value `Setting` model instead of dedicated columns for flexibility
