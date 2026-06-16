import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/ea-bridge/* → NestJS backend
 *
 * EA Bridge endpoints:
 *   GET  /api/ea-bridge/briefs          — استطلاع التوصيات
 *   POST /api/ea-bridge/heartbeat        — نبضة حياة
 *   POST /api/ea-bridge/execution        — تقرير تنفيذ
 *   POST /api/ea-bridge/positions        — تحديث المراكز
 *   GET  /api/ea-bridge/config           — جلب الإعدادات
 *   GET  /api/ea-bridge/status           — حالة EA
 *   POST /api/ea-bridge/generate-token   — إنشاء توكن جديد
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
