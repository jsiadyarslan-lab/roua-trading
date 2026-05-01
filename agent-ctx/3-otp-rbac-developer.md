# Task 3: OTP Login System + RBAC Permissions

**Agent**: Full-Stack Developer
**Status**: ✅ Complete

## Summary

Implemented OTP-based email login with 6-digit verification codes and a complete RBAC permission system for the ROUA Trading Platform.

## Files Created

1. `apps/web/src/app/api/auth/otp/send/route.ts` — OTP send endpoint (rate-limited, 10-min expiry)
2. `apps/web/src/app/api/auth/otp/verify/route.ts` — OTP verify + session creation endpoint
3. `apps/web/src/lib/permissions.ts` — RBAC permission system (6 roles, 20 permissions, helper functions)
4. `apps/web/src/components/dashboard/PermissionGuard.tsx` — React permission guard component

## Files Modified

1. `prisma/schema.prisma` — Added VerificationToken model
2. `apps/web/src/lib/db.ts` — Added safety-net migration for VerificationToken table
3. `apps/web/src/app/login/page.tsx` — Added OTP login flow alongside existing direct login

## Key Decisions

- Role types aligned with existing DB Tier enum: FREE, PRO, PLUS, PREMIUM, INSTITUTIONAL, ADMIN
- PermissionGuard uses `useAuth` hook (not auth-store) since it's the simpler existing API
- OTP is default login method, direct login preserved for backward compatibility
- VerificationToken table created via safety-net migration in db.ts (no running PostgreSQL in sandbox)
