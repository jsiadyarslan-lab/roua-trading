# Task 3a: Build Trading Next.js API Routes (Phase 5)

## Status: COMPLETED

## Summary
All 9 Next.js API route files for the trading engine already exist with correct implementations. The next.config.ts also already contains the trading proxy rewrite. No changes were needed.

## Verification Results

### API Route Files (all verified ✅)

1. **`apps/web/src/app/api/trading/orders/route.ts`** - GET (symbol, status, limit query params) + POST (place order)
2. **`apps/web/src/app/api/trading/orders/[id]/route.ts`** - GET (get order) + DELETE (cancel order) with `params: Promise<{ id: string }>` and `await params`
3. **`apps/web/src/app/api/trading/positions/route.ts`** - GET (list open positions)
4. **`apps/web/src/app/api/trading/positions/summary/route.ts`** - GET (position summary)
5. **`apps/web/src/app/api/trading/positions/close/route.ts`** - POST (close position with body)
6. **`apps/web/src/app/api/trading/positions/[id]/levels/route.ts`** - POST (update SL/TP with body)
7. **`apps/web/src/app/api/trading/trades/route.ts`** - GET (trade history with limit query param)
8. **`apps/web/src/app/api/trading/risk/parameters/route.ts`** - GET (risk parameters)
9. **`apps/web/src/app/api/trading/risk/position-size/route.ts`** - POST (calculate position size with body)

### Compliance Checklist (all ✅)

- Import NextRequest, NextResponse from 'next/server'
- Define `API_BASE` as `process.env.API_URL || 'http://localhost:3001/api'`
- Handle auth (return 401 with Arabic error 'غير مصادق' if no session token)
- Session token from `req.cookies.get('roua_session')?.value` or Authorization header
- Proxy to NestJS with Cookie and Authorization headers
- Handle errors with try/catch returning 500 status
- Dynamic routes use `params: Promise<{ id: string }>` and `await params`

### next.config.ts (verified ✅)

Trading proxy rewrite already exists in both configuration branches:
- Default (no API_INTERNAL_URL): `/api/trading/:path*` → `${apiTarget}/api/trading/:path*`
- With API_INTERNAL_URL: `/api/trading/:path*` → `${apiTarget}/api/trading/:path*`

### Route Alignment with NestJS Controller

All proxy routes correctly map to the NestJS TradingController endpoints:
- GET/POST /trading/orders ↔ @Get/@Post('orders')
- GET/DELETE /trading/orders/:id ↔ @Get/@Delete('orders/:id')
- GET /trading/positions ↔ @Get('positions')
- GET /trading/positions/summary ↔ @Get('positions/summary')
- POST /trading/positions/close ↔ @Post('positions/close')
- POST /trading/positions/:id/levels ↔ @Post('positions/:id/levels')
- GET /trading/trades ↔ @Get('trades')
- GET /trading/risk/parameters ↔ @Get('risk/parameters')
- POST /trading/risk/position-size ↔ @Post('risk/position-size')

### Lint Check
- No lint errors in trading API route files
- Pre-existing lint errors in dashboard pages (unrelated to this task)
