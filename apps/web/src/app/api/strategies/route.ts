import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Seed dummy data if DB is empty
const INITIAL_SEED = [
  {
    symbol: 'EUR/USD',
    assetName: 'Euro / US Dollar',
    title: 'تأثير التضخم والسيولة على العملات',
    type: 'Forex Macro',
    severity: 'High',
    price: 1.0850,
    change: 0.12,
    isUp: true,
    tag: 'INFLATION WATCH',
    decision: JSON.stringify({
      title: 'انتظار (تحوط)', color: '#FFB800', desc: 'حالة ترقب لبيانات التضخم الأمريكية غداً.'
    }),
    matrix: JSON.stringify([
      { label: 'مؤسسات', val: 4, max: 10, color: '#FF4D4D' },
      { label: 'سيولة', val: 6, max: 10, color: '#00C8FF' },
      { label: 'جيوسياسية', val: 8, max: 10, color: '#E6A23C' }
    ]),
    risk: JSON.stringify({
      var: '-$1.2M', beta: '1.14', sharpe: '2.1', pe: 'N/A', peAlert: false, fv: '1.0920', ratio: 65
    }),
    flow: JSON.stringify([
      { time: '14:32', size: '2.5M Lts', type: 'Buy Block', heat: 90, color: '#00FFC6' },
      { time: '13:15', size: '1.1M Lts', type: 'Neutral', heat: 40, color: '#A0AFC3' },
      { time: '11:05', size: '4.8M Lts', type: 'Accumulate', heat: 100, color: '#0A84FF' }
    ]),
    consensus: 'شراء متراكم (Accumulation)',
    hiddenSignature: 'تحركات سيولة استثنائية في أسواق الخيارات ترجح تحوط المؤسسات الكبرى.',
    deepAnalysis: JSON.stringify([
      'التداولات محصورة في نطاق جانبي بين 1.0820 و 1.0880 بحسب السجلات.',
      'دفاع شرس من المشترين عند الحد السفلي، لكن الزخم يفتقر للتدفقات الباطنية الصحيحة.',
      'احتمالية كسر مستويات الدعم واردة إذا جاءت بيانات مؤشر أسعار المستهلكين (CPI) أعلى.'
    ])
  },
  {
    symbol: 'BTC/USD',
    assetName: 'Bitcoin Network',
    title: 'تخارج الحيتان من سلاسل الكتل',
    type: 'Crypto Quant',
    severity: 'Medium',
    price: 64230.00,
    change: -2.40,
    isUp: false,
    tag: 'CRYPTO / L1',
    decision: JSON.stringify({
      title: 'شراء تدريجي', color: '#00FFC6', desc: 'تشبع بيعي حاد على الأطر اليومية، فرصة ممتازة لبناء مراكز استثمارية.'
    }),
    matrix: JSON.stringify([
      { label: 'مؤسسات', val: 7, max: 10, color: '#00FFC6' },
      { label: 'سيولة', val: 3, max: 10, color: '#FF4D4D' },
      { label: 'جيوسياسية', val: 5, max: 10, color: '#E6A23C' }
    ]),
    risk: JSON.stringify({
      var: '-$4.5M', beta: '2.80', sharpe: '1.4', pe: 'N/A', peAlert: false, fv: '72,000', ratio: 25
    }),
    flow: JSON.stringify([
      { time: '16:00', size: '400 BTC', type: 'Sell Block', heat: 85, color: '#FF4D4D' },
      { time: '14:20', size: '120 BTC', type: 'Distribution', heat: 60, color: '#FFB800' },
      { time: '09:05', size: '50 BTC', type: 'Neutral', heat: 20, color: '#A0AFC3' }
    ]),
    consensus: 'توزيع بيعي (Distribution)',
    hiddenSignature: 'محافظ مجهولة تقوم بتجميع كميات ضخمة (OTC) خارج السجلات.',
    deepAnalysis: JSON.stringify([
      'تصفية عقود آجلة بقيمة تتجاوز 400 مليون دولار خففت الضغوط البيعية.',
      'مستويات 62,000$ تمثل نقطة ارتكاز صلبة لطلبات الشراء المخفية.',
      'الدخول بـ 30% من الكمية المستهدفة هنا، والانتظار لاختبار السيولة.'
    ])
  }
];

export async function GET() {
  try {
    // 1. Fetch available reports
    let reports = await prisma.strategyReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // 2. Auto-seed if database stringified structure empty
    if (reports.length === 0) {
      await prisma.strategyReport.createMany({
        data: INITIAL_SEED
      });
      reports = await prisma.strategyReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20
      });
    }

    // 3. Decode JSON fields before sending to client
    const decodedReports = reports.map(r => ({
      ...r,
      date: 'اليوم', // Real-time representation handling
      decision: JSON.parse(r.decision),
      matrix: JSON.parse(r.matrix),
      risk: JSON.parse(r.risk),
      flow: JSON.parse(r.flow),
      deepAnalysis: JSON.parse(r.deepAnalysis)
    }));

    return NextResponse.json({ success: true, data: decodedReports });
  } catch (error) {
    console.error('API Error: GET /api/strategies', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch strategy reports' }, { status: 500 });
  }
}
