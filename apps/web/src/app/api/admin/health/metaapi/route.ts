import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /api/admin/health/metaapi — MetaAPI Cloud connection test
 *
 * Verifies that the METAAPI_TOKEN environment variable is set and valid
 * by attempting to list MT5 accounts registered in MetaAPI Cloud.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const token = process.env.METAAPI_TOKEN
  const startTime = Date.now()

  // Step 1: Check if token exists
  if (!token) {
    return NextResponse.json({
      status: 'error',
      message: 'METAAPI_TOKEN غير مضبوط — أضفه كمتغير بيئة في Railway',
      tokenPresent: false,
      elapsed: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    })
  }

  // Step 2: Test token by calling MetaAPI Cloud
  try {
    const metaApiModule: any = await import('metaapi.cloud-sdk')
    const MetaApiClass = metaApiModule.default || metaApiModule
    const api = new MetaApiClass(token)

    // Try to get list of MT5 accounts — this validates the token
    let accounts: any[] = []
    let accountsMethod = 'unknown'

    try {
      const accountApi = api.metatraderAccountApi
      if (accountApi && typeof accountApi.getAccounts === 'function') {
        accounts = await accountApi.getAccounts()
        accountsMethod = 'metatraderAccountApi.getAccounts'
      } else if (typeof api.getAccounts === 'function') {
        accounts = await api.getAccounts()
        accountsMethod = 'api.getAccounts'
      } else {
        // Try the provisioning profile API as a simpler token validation
        const provApi = api.provisioningProfileApi
        if (provApi && typeof provApi.getProvisioningProfiles === 'function') {
          const profiles = await provApi.getProvisioningProfiles()
          accountsMethod = 'provisioningProfileApi.getProvisioningProfiles'
          return NextResponse.json({
            status: 'ok',
            message: 'مفتاح MetaAPI صحيح ويعمل بنجاح',
            tokenPresent: true,
            tokenValid: true,
            provisioningProfiles: Array.isArray(profiles) ? profiles.length : 0,
            accountsMethod,
            elapsed: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          })
        }
      }
    } catch (apiError: any) {
      const msg = apiError?.message || String(apiError)
      if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('Invalid token') || msg.includes('Forbidden')) {
        return NextResponse.json({
          status: 'error',
          message: 'مفتاح MetaAPI غير صالح — تم رفض الاتصال. تأكد من نسخ المفتاح الصحيح من metaapi.cloud',
          tokenPresent: true,
          tokenValid: false,
          error: msg.substring(0, 200),
          elapsed: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        })
      }
      // Other API errors — token might still be valid
      return NextResponse.json({
        status: 'partial',
        message: 'المفتاح موجود لكن فشل جلب الحسابات — تحقق من صلاحيات المفتاح',
        tokenPresent: true,
        tokenValid: true,
        accountsFound: 0,
        error: msg.substring(0, 200),
        accountsMethod,
        elapsed: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      status: 'ok',
      message: `مفتاح MetaAPI صحيح ويعمل بنجاح — ${accounts.length} حساب MT5 مسجل`,
      tokenPresent: true,
      tokenValid: true,
      accountsFound: accounts.length,
      accounts: accounts.map((a: any) => ({
        id: a.id,
        login: a.login,
        name: a.name,
        type: a.type || a.accountType,
        server: a.server,
        state: a.state || a.status,
        platform: a.platform,
      })),
      accountsMethod,
      elapsed: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    const msg = error?.message || String(error)

    if (msg.includes('METAAPI_TOKEN')) {
      return NextResponse.json({
        status: 'error',
        message: 'METAAPI_TOKEN غير مضبوط',
        tokenPresent: false,
        tokenValid: false,
        error: msg.substring(0, 200),
        elapsed: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      status: 'error',
      message: 'فشل اختبار اتصال MetaAPI Cloud',
      tokenPresent: true,
      tokenValid: false,
      error: msg.substring(0, 200),
      elapsed: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    })
  }
}
