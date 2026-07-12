import { NextResponse } from 'next/server'
import T from '@/lib/unified-tokens'

/**
 * GET /api/marketplace
 * Returns marketplace items (strategies, bots, indicators) for the mobile marketplace page.
 * Currently returns curated demo data; can be extended to fetch from DB.
 */

interface MarketplaceItem {
  id: string
  name: string
  description: string
  category: 'استراتيجيات' | 'بوتات' | 'مؤشرات'
  price: number
  priceLabel: string
  rating: number
  reviews: number
  author: string
  authorAvatar: string
  subscribers: number
  returnPct: number
  winRate: number
  icon: string
  color: string
  isFeatured?: boolean
}

const MARKETPLACE_ITEMS: MarketplaceItem[] = [
  // ─── استراتيجيات ───
  {
    id: 'strat-1',
    name: 'متابع الاتجاه الذكي',
    description: 'استراتيجية تتبع الاتجاه القوي باستخدام EMA و MACD مع فلتر زخم متقدم',
    category: 'استراتيجيات',
    price: 29,
    priceLabel: '$29/شهر',
    rating: 4.8,
    reviews: 142,
    author: 'أحمد التركي',
    authorAvatar: 'أ',
    subscribers: 890,
    returnPct: 67.3,
    winRate: 74,
    icon: '📈',
    color: T.info,
    isFeatured: true,
  },
  {
    id: 'strat-2',
    name: 'العودة للمتوسط',
    description: 'استراتيجية متقدمة للعودة للمتوسط عند الانحرافات الكبيرة مع إدارة مخاطر ذكية',
    category: 'استراتيجيات',
    price: 19,
    priceLabel: '$19/شهر',
    rating: 4.5,
    reviews: 89,
    author: 'سارة الخالدي',
    authorAvatar: 'س',
    subscribers: 520,
    returnPct: 42.1,
    winRate: 68,
    icon: '🔄',
    color: T.council,
  },
  {
    id: 'strat-3',
    name: 'اختراق الدعم والمقاومة',
    description: 'دخول عند اختراق مستويات الدعم والمقاومة مع تأكيد الحجم والأمر',
    category: 'استراتيجيات',
    price: 35,
    priceLabel: '$35/شهر',
    rating: 4.6,
    reviews: 67,
    author: 'محمد العتيبي',
    authorAvatar: 'م',
    subscribers: 340,
    returnPct: 55.8,
    winRate: 71,
    icon: '⚡',
    color: T.warning,
  },
  {
    id: 'strat-4',
    name: 'زخم RSI المتقدم',
    description: 'تداول مع تدفق الزخم بناءً على RSI مع فلتر اتجاه متعدد الأطر الزمنية',
    category: 'استراتيجيات',
    price: 15,
    priceLabel: '$15/شهر',
    rating: 4.2,
    reviews: 45,
    author: 'نورة السعيد',
    authorAvatar: 'ن',
    subscribers: 210,
    returnPct: 31.4,
    winRate: 63,
    icon: '🚀',
    color: '#32D74B',
  },

  // ─── بوتات ───
  {
    id: 'bot-1',
    name: 'بوت فولكس واغن',
    description: 'بوت تداول آلي يجمع بين عدة استراتيجيات مع إدارة مخاطر متقدمة وتنويع تلقائي',
    category: 'بوتات',
    price: 49,
    priceLabel: '$49/شهر',
    rating: 4.9,
    reviews: 234,
    author: 'خالد الشمري',
    authorAvatar: 'خ',
    subscribers: 1450,
    returnPct: 89.2,
    winRate: 78,
    icon: '🤖',
    color: T.info,
    isFeatured: true,
  },
  {
    id: 'bot-2',
    name: 'بوت التحكيم السريع',
    description: 'بوت يكتشف فرص التحكيم بين البورصات وينفذها بسرعة فائقة',
    category: 'بوتات',
    price: 59,
    priceLabel: '$59/شهر',
    rating: 4.7,
    reviews: 112,
    author: 'فهد الدوسري',
    authorAvatar: 'ف',
    subscribers: 670,
    returnPct: 34.5,
    winRate: 82,
    icon: '⚡',
    color: T.warning,
  },
  {
    id: 'bot-3',
    name: 'بوت شبكات التداول',
    description: 'بوت شبكي (Grid) يعمل في نطاقات سعريه محددة مع إعادة التوازن التلقائي',
    category: 'بوتات',
    price: 25,
    priceLabel: '$25/شهر',
    rating: 4.3,
    reviews: 76,
    author: 'ريم القحطاني',
    authorAvatar: 'ر',
    subscribers: 430,
    returnPct: 28.9,
    winRate: 70,
    icon: '🕸️',
    color: T.council,
  },

  // ─── مؤشرات ───
  {
    id: 'ind-1',
    name: 'مؤشر التدفق الذكي',
    description: 'مؤشر مخصص يحلل تدفق الأموال الذكية ويعطي إشارات دخول وخروج مبكرة',
    category: 'مؤشرات',
    price: 12,
    priceLabel: '$12/شهر',
    rating: 4.6,
    reviews: 198,
    author: 'عبدالله المطيري',
    authorAvatar: 'ع',
    subscribers: 1200,
    returnPct: 0,
    winRate: 0,
    icon: '📊',
    color: T.info,
    isFeatured: true,
  },
  {
    id: 'ind-2',
    name: 'مؤشر التباعد التقارب',
    description: 'مؤشر MACD متقدم مع إشارات مبكرة للتباعد والتقارب وأوضاع السوق',
    category: 'مؤشرات',
    price: 8,
    priceLabel: '$8/شهر',
    rating: 4.4,
    reviews: 56,
    author: 'لينا الحربي',
    authorAvatar: 'ل',
    subscribers: 380,
    returnPct: 0,
    winRate: 0,
    icon: '〰️',
    color: '#32D74B',
  },
  {
    id: 'ind-3',
    name: 'مؤشر حجم النخبة',
    description: 'تحليل حجم متقدم يتعقب حركة الأموال المؤسسية ويعرضها بشكل مرئي',
    category: 'مؤشرات',
    price: 15,
    priceLabel: '$15/شهر',
    rating: 4.7,
    reviews: 88,
    author: 'سلطان العنزي',
    authorAvatar: 'س',
    subscribers: 560,
    returnPct: 0,
    winRate: 0,
    icon: '📉',
    color: T.warning,
  },
]

export async function GET() {
  try {
    const totalSubscribers = MARKETPLACE_ITEMS.reduce((sum, item) => sum + item.subscribers, 0)
    const avgRating = MARKETPLACE_ITEMS.reduce((sum, item) => sum + item.rating, 0) / MARKETPLACE_ITEMS.length

    return NextResponse.json({
      items: MARKETPLACE_ITEMS,
      stats: {
        totalItems: MARKETPLACE_ITEMS.length,
        totalSubscribers,
        avgRating: Math.round(avgRating * 10) / 10,
      },
    })
  } catch (error) {
    console.error('API Error: GET /api/marketplace', error)
    return NextResponse.json(
      { items: [], stats: { totalItems: 0, totalSubscribers: 0, avgRating: 0 }, error: 'Service unavailable' },
      { status: 500 },
    )
  }
}
