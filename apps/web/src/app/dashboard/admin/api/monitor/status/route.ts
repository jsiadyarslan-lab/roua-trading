import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Monitor agent status - for now returns basic status
  // Will be enhanced when monitor agent reports back via API
  return NextResponse.json({
    running: false,
    lastCheck: null,
    message: 'وكيل المراقبة غير مفعل - قم بنشره على Railway أولاً',
    agentUrl: 'https://github.com/jsiadyarslan-lab/roua-monitor',
    checkInterval: 60,
    endpoints: [
      { path: '/', label: 'الصفحة الرئيسية' },
      { path: '/api/health', label: 'فحص الصحة' },
      { path: '/api/auth/session', label: 'الجلسات' },
      { path: '/api/exchange/quote/BTC-USD', label: 'أسعار BTC' },
      { path: '/api/scanner/scan', label: 'الماسح' },
      { path: '/api/signals/smart', label: 'الإشارات' },
      { path: '/api/portfolio/summary', label: 'المحفظة' },
      { path: '/api/ai/status', label: 'حالة AI' },
      { path: '/api/news/feed', label: 'الأخبار' },
      { path: '/api/neural/models', label: 'النماذج العصبية' },
    ],
  })
}
