---
Task ID: 1
Agent: Main Agent
Task: Fix the git disaster and properly apply Fix 1 (remove duplicate constants) on the original GitHub repo

Work Log:
- Analyzed the situation: local repo had 8 commits vs GitHub's 1898 commits, force push had destroyed original
- Confirmed GitHub was already restored to original state (commit e76cce45 + faeb083b)
- Cloned a fresh copy of the original GitHub repo to /home/z/roua-original/
- Found that the previous fix (faeb083b) already addressed SOME duplicates but 14 more remained across 9 files
- Expanded CRYPTO_BASES in config.ts to include 20 additional tokens from margin-calculator.ts
- Added BINANCE_INTERVALS sub-second mappings, BINANCE_US_REST, AUDIO_TONES to config.ts
- Replaced all 14 duplicate constants across 9 files with imports from config.ts
- Fixed relative import paths (5 levels not 6) for API route files
- Built successfully with `next build --webpack` — no errors
- Committed and pushed normally (NO force push) to GitHub: faeb083b..c543b480

Stage Summary:
- GitHub repo: https://github.com/jsiadyarslan-lab/roua-trading.git — now has commit c543b480
- 12 files changed, 61 insertions, 45 deletions
- Build passes ✅
- Push succeeded ✅ (normal push, no force)
- Files modified: config.ts, trading-intelligence.ts, margin-calculator.ts, useMarketData.ts, MarketProvider.tsx, exchange/history/route.ts, exchange/quote/route.ts, diagnostics/route.ts, ai-direct-calls.ts, useNotificationStore.ts, AlertManager.tsx, PriceAlertLine.tsx
