/**
 * RBAC Permission System for ROUA Trading Platform
 *
 * Defines roles, permissions, and helper functions to check access.
 *
 * Note: The Role type here maps to the user's tier from the database,
 * with an additional ADMIN role for system administrators.
 * The database Tier enum is: FREE, PRO, PLUS, PREMIUM, INSTITUTIONAL.
 * This permission system maps those tiers to permission groups.
 */

export type Role = 'FREE' | 'PRO' | 'PLUS' | 'PREMIUM' | 'INSTITUTIONAL' | 'ADMIN'

export type Permission =
  // Trading
  | 'trade:view'
  | 'trade:execute'
  | 'trade:paper'
  | 'trade:leverage:high'
  // AI
  | 'ai:insights'
  | 'ai:auto_trade'
  | 'ai:scanner'
  | 'ai:advanced_models'
  // Portfolio
  | 'portfolio:view'
  | 'portfolio:advanced'
  // Social
  | 'social:view'
  | 'social:copy_trade'
  // API
  | 'api:access'
  | 'api:webhooks'
  // Data
  | 'data:real_time'
  | 'data:historical'
  | 'data:export'
  // Features
  | 'feature:multi_account'
  | 'feature:custom_strategies'
  | 'feature:priority_support'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  FREE: [
    'trade:view',
    'trade:paper',
    'ai:insights',
    'portfolio:view',
    'social:view',
    'data:real_time',
  ],
  PRO: [
    'trade:view',
    'trade:execute',
    'trade:paper',
    'trade:leverage:high',
    'ai:insights',
    'ai:auto_trade',
    'ai:scanner',
    'portfolio:view',
    'portfolio:advanced',
    'social:view',
    'social:copy_trade',
    'data:real_time',
    'data:historical',
    'feature:priority_support',
  ],
  PLUS: [
    'trade:view',
    'trade:execute',
    'trade:paper',
    'trade:leverage:high',
    'ai:insights',
    'ai:auto_trade',
    'ai:scanner',
    'ai:advanced_models',
    'portfolio:view',
    'portfolio:advanced',
    'social:view',
    'social:copy_trade',
    'api:access',
    'data:real_time',
    'data:historical',
    'data:export',
    'feature:multi_account',
    'feature:custom_strategies',
    'feature:priority_support',
  ],
  PREMIUM: [
    'trade:view',
    'trade:execute',
    'trade:paper',
    'trade:leverage:high',
    'ai:insights',
    'ai:auto_trade',
    'ai:scanner',
    'ai:advanced_models',
    'portfolio:view',
    'portfolio:advanced',
    'social:view',
    'social:copy_trade',
    'api:access',
    'api:webhooks',
    'data:real_time',
    'data:historical',
    'data:export',
    'feature:multi_account',
    'feature:custom_strategies',
    'feature:priority_support',
  ],
  INSTITUTIONAL: [
    // Institutional has all permissions
    'trade:view',
    'trade:execute',
    'trade:paper',
    'trade:leverage:high',
    'ai:insights',
    'ai:auto_trade',
    'ai:scanner',
    'ai:advanced_models',
    'portfolio:view',
    'portfolio:advanced',
    'social:view',
    'social:copy_trade',
    'api:access',
    'api:webhooks',
    'data:real_time',
    'data:historical',
    'data:export',
    'feature:multi_account',
    'feature:custom_strategies',
    'feature:priority_support',
  ],
  ADMIN: [
    // Admin has all permissions — we use a special check
  ] as Permission[],
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role | string | undefined, permission: Permission): boolean {
  if (!role) return false
  if (role === 'ADMIN') return true // Admin has all permissions
  const perms = ROLE_PERMISSIONS[role as Role]
  if (!perms) return false
  return perms.includes(permission)
}

/**
 * Check if a role has ALL of the specified permissions
 */
export function hasAllPermissions(role: Role | string | undefined, permissions: Permission[]): boolean {
  if (!role) return false
  if (role === 'ADMIN') return true
  return permissions.every(p => hasPermission(role, p))
}

/**
 * Check if a role has ANY of the specified permissions
 */
export function hasAnyPermission(role: Role | string | undefined, permissions: Permission[]): boolean {
  if (!role) return false
  if (role === 'ADMIN') return true
  return permissions.some(p => hasPermission(role, p))
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: Role | string | undefined): Permission[] {
  if (!role) return []
  if (role === 'ADMIN') return Object.values(ROLE_PERMISSIONS).flat()
  return ROLE_PERMISSIONS[role as Role] || []
}

/**
 * Role display info
 */
export const ROLE_INFO: Record<Role, { label: string; color: string; description: string }> = {
  FREE: {
    label: 'مجاني',
    color: '#94a3b8',
    description: 'تداول ورقي ورؤى أساسية',
  },
  PRO: {
    label: 'احترافي',
    color: '#00D4FF',
    description: 'تداول حقيقي وذكاء اصطناعي',
  },
  PLUS: {
    label: 'بلس',
    color: '#A855F7',
    description: 'ذكاء اصطناعي متقدم وAPI',
  },
  PREMIUM: {
    label: 'نخبة',
    color: '#FFB800',
    description: 'وصول كامل وAPI وأدوات متقدمة',
  },
  INSTITUTIONAL: {
    label: 'مؤسسي',
    color: '#10B981',
    description: 'صلاحيات مؤسسية كاملة',
  },
  ADMIN: {
    label: 'مدير',
    color: '#FF4757',
    description: 'صلاحيات إدارية كاملة',
  },
}
