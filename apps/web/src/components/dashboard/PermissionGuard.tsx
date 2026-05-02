'use client'

import { useAuth } from '@/hooks/useAuth'
import { hasPermission, type Permission } from '@/lib/permissions'

/**
 * PermissionGuard — Conditionally renders children based on user permissions.
 *
 * Uses the existing useAuth hook to get the user's tier,
 * then checks permissions via the RBAC system.
 *
 * Usage:
 * <PermissionGuard permission="trade:execute">
 *   <ExecuteTradeButton />
 * </PermissionGuard>
 *
 * <PermissionGuard permission="ai:auto_trade" fallback={<UpgradePrompt />}>
 *   <AutoTradeToggle />
 * </PermissionGuard>
 *
 * <PermissionGuard permissions={['trade:execute', 'trade:leverage:high']} requireAll>
 *   <LeveragedTrading />
 * </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: {
  permission?: Permission
  permissions?: Permission[]
  requireAll?: boolean
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const tier = user?.tier

  // While loading, don't render anything (avoid flash)
  if (loading) return null

  if (permission) {
    if (!hasPermission(tier, permission)) return <>{fallback}</>
  }

  if (permissions) {
    if (requireAll) {
      if (!permissions.every(p => hasPermission(tier, p))) return <>{fallback}</>
    } else {
      if (!permissions.some(p => hasPermission(tier, p))) return <>{fallback}</>
    }
  }

  return <>{children}</>
}
