# Task: Fix 3 issues in Roua Trading Next.js project

## Summary of Changes

### FIX 1: Fix notifications button error on mobile
**File**: `/home/z/my-project/roua-trading/apps/web/src/app/mobile/notifications/page.tsx`

**Root cause**: The server API `/api/notifications/events` returns notifications with `source` values like `'new_user'`, `'subscription_upgrade'`, `'system_error'`, etc. that don't match the `NotifSource` type (`'bot' | 'ai' | 'scanner' | 'trade' | 'system'`). These invalid source values were passed directly to `addNotification`, causing type safety issues and broken deduplication.

Additionally, the dedup logic checked `n.id === notif.id` (server ID), but `addNotification` generates new IDs internally, so server notifications were never found as duplicates — causing them to be re-added every 30 seconds on each poll.

**Fix applied**:
1. Added `mapServerSource()` function that maps server source values (`new_user`, `subscription_upgrade`, `system_error`, `performance_alert`, `large_trade`, `system_update`, `admin_test`, `push`) to valid `NotifSource` types (`system`, `trade`, etc.)
2. Added `mapServerAction()` function that maps server action/type values to valid `NotifAction` types
3. Changed dedup logic from checking server ID (`n.id === notif.id`) to checking by title + source + body content, which properly prevents duplicates since `addNotification` generates its own IDs
4. Applied the same fix in both the `useEffect` fetch and the `handleRefresh` callback
5. Imported `NotifAction` type for proper type safety

### FIX 2: Make navbar buttons 50% bigger
**File**: `/home/z/my-project/roua-trading/apps/web/src/components/mobile/MobileNavBar.tsx`

**Changes**:
- Regular nav icon size: 21px → 32px
- Regular button width: 48px → 72px
- Center wallet button width/height: 44px → 66px
- Wallet icon size: 22px → 33px

### FIX 3: Use logo icon as PWA icon for both mobile and desktop
**Files modified**:
1. `/home/z/my-project/roua-trading/apps/web/public/favicon.svg` — Replaced the globe icon with the "Z" letter mark from logo.svg (without the breathing animation which doesn't work well as a static favicon)
2. `/home/z/my-project/roua-trading/apps/web/src/app/mobile/layout.tsx` — Updated `icons` metadata to prioritize `logo.svg` as the primary icon, added PNG sizes with explicit `sizes` attribute, changed `apple` from a single string to an array with multiple sizes
3. `/home/z/my-project/roua-trading/apps/web/src/app/dashboard/layout.tsx` — Same icon metadata updates as mobile layout
4. `/home/z/my-project/roua-trading/apps/web/src/app/layout.tsx` — Added `icons` metadata section with the same logo references, and added explicit `<link rel="icon" href="/logo.svg">` in the `<head>`

**Note**: The `logo-192.png` and `logo-512.png` files already exist in `/apps/web/public/` and are proper PNG files. The `manifest.json` already references `/logo.svg` and the PNG icons correctly.

## Verification
- Ran TypeScript compilation check — no new errors introduced by these changes
- All pre-existing TypeScript errors are in unrelated files
