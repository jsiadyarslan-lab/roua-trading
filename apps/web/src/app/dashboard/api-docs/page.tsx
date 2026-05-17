'use client'

import { useState, useCallback } from 'react'
import {
  Code, ChevronDown, Copy, Check, Key, Shield, Zap, Clock,
  Globe, Lock, Eye, EyeOff, Trash2, Plus, Terminal, FileJson,
  Braces, Webhook, AlertTriangle, Info, RefreshCw, Send,
  BarChart3, Brain, Radio, TrendingUp, Server, BookOpen
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

/* ═══════════════════════════════════════════════════════
   Design Tokens (canonical + local extensions)
═══════════════════════════════════════════════════════ */
const T = { ...SharedT, pink: '#f472b6', text4: '#475569' }

/* ═══════════════════════════════════════════════════════
   Method Badge Colors
═══════════════════════════════════════════════════════ */
const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GET:    { bg: `${T.green}14`, text: T.green, border: `${T.green}30` },
  POST:   { bg: `${T.cyan}14`, text: T.cyan, border: `${T.cyan}30` },
  DELETE: { bg: `${T.red}14`, text: T.red, border: `${T.red}30` },
  PUT:    { bg: `${T.amber}14`, text: T.amber, border: `${T.amber}30` },
  PATCH:  { bg: `${T.purple}14`, text: T.purple, border: `${T.purple}30` },
}

/* ═══════════════════════════════════════════════════════
   Code Block Component
═══════════════════════════════════════════════════════ */
function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      toast({ title: 'تم النسخ', description: 'تم نسخ الكود إلى الحافظة' })
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code])

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', margin: '8px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', background: '#0A0C14',
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{
          fontSize: 9, color: T.text4, fontFamily: "'JetBrains Mono', monospace",
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          {language}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: copied ? T.green : T.text4, display: 'flex',
            alignItems: 'center', gap: 4, fontSize: 10,
            fontFamily: "'Cairo', sans-serif", fontWeight: 600,
            transition: 'color 0.2s',
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '14px 16px', background: '#07080E',
        overflowX: 'auto', direction: 'ltr', textAlign: 'left',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5,
        lineHeight: 1.7, color: T.text2,
        maxHeight: 280,
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Endpoint Data Types
═══════════════════════════════════════════════════════ */
interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'
  path: string
  description: string
  permission: string
  requestBody?: string
  responseExample: string
}

interface EndpointCategory {
  id: string
  title: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  description: string
  endpoints: Endpoint[]
}

/* ═══════════════════════════════════════════════════════
   Endpoint Categories Data
═══════════════════════════════════════════════════════ */
const ENDPOINT_CATEGORIES: EndpointCategory[] = [
  {
    id: 'auth',
    title: 'المصادقة',
    icon: <Lock size={18} />,
    iconColor: T.purple,
    iconBg: `${T.purple}14`,
    description: 'إدارة المصادقة والجلسات وتحقق OTP',
    endpoints: [
      {
        method: 'POST',
        path: '/auth/otp/send',
        description: 'إرسال رمز التحقق OTP إلى رقم الهاتف أو البريد الإلكتروني المسجل',
        permission: 'none',
        requestBody: JSON.stringify({
          phone: "+966500000000",
          channel: "sms"
        }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          data: {
            requestId: "req_a1b2c3d4",
            expiresIn: 300,
            channel: "sms"
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/auth/otp/verify',
        description: 'التحقق من رمز OTP وإرجاع رمز الوصول (Access Token)',
        permission: 'none',
        requestBody: JSON.stringify({
          requestId: "req_a1b2c3d4",
          code: "123456"
        }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          data: {
            accessToken: "eyJhbGciOiJIUzI1NiIs...",
            refreshToken: "rt_f8e7d6c5b4a3",
            expiresIn: 3600,
            user: {
              id: "usr_12345",
              displayName: "متداول رؤى",
              tier: "PRO"
            }
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/auth/me',
        description: 'استرجاع بيانات المستخدم الحالي مع صلاحياته وخطة الاشتراك',
        permission: 'read',
        requestBody: undefined,
        responseExample: JSON.stringify({
          success: true,
          data: {
            id: "usr_12345",
            displayName: "متداول رؤى",
            email: "user@roua.io",
            phone: "+966500000000",
            tier: "PRO",
            permissions: ["read"],
            createdAt: "2025-08-12T10:30:00Z",
            lastLogin: "2026-03-04T14:22:00Z"
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/auth/refresh',
        description: 'تجديد جلسة المستخدم باستخدام رمز التحديث (Refresh Token)',
        permission: 'none',
        requestBody: JSON.stringify({
          refreshToken: "rt_f8e7d6c5b4a3"
        }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          data: {
            accessToken: "eyJhbGciOiJIUzI1NiIs...",
            refreshToken: "rt_new_token_here",
            expiresIn: 3600
          }
        }, null, 2),
      },
    ],
  },
  {
    id: 'markets',
    title: 'الأسواق',
    icon: <BarChart3 size={18} />,
    iconColor: T.cyan,
    iconBg: `${T.cyan}14`,
    description: 'بيانات الأسواق المباشرة والتاريخية',
    endpoints: [
      {
        method: 'GET',
        path: '/exchange/quote/:symbol',
        description: 'الحصول على السعر المباشر لزوج تداول محدد مع بيانات السوق الأساسية',
        permission: 'read',
        requestBody: undefined,
        responseExample: JSON.stringify({
          success: true,
          data: {
            symbol: "BTC/USDT",
            price: 97542.50,
            change24h: 2.34,
            high24h: 98100.00,
            low24h: 95200.00,
            volume24h: 2847563210.50,
            bid: 97541.00,
            ask: 97544.00,
            timestamp: "2026-03-04T14:30:00Z",
            source: "binance"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/exchange/history/:symbol',
        description: 'استرجاع بيانات تاريخية (شموع) لزوج تداول محدد مع إمكانية تحديد الإطار الزمني',
        permission: 'read',
        requestBody: undefined,
        responseExample: JSON.stringify({
          success: true,
          data: {
            symbol: "BTC/USDT",
            interval: "1h",
            candles: [
              {
                time: "2026-03-04T13:00:00Z",
                open: 97200.00,
                high: 97650.00,
                low: 97100.00,
                close: 97542.50,
                volume: 15234.78
              }
            ],
            count: 500
          }
        }, null, 2),
      },
    ],
  },
  {
    id: 'trading',
    title: 'الحسابات المربوطة',
    icon: <TrendingUp size={18} />,
    iconColor: T.green,
    iconBg: `${T.green}14`,
    description: 'إدارة الحسابات المربوطة ومتابعة المراكز المفتوحة',
    endpoints: [
      {
        method: 'POST',
        path: '/accounts/link',
        description: 'ربط حساب بورصة جديد عبر مفاتيح API مع التحقق التلقائي من الاتصال',
        permission: 'read',
        requestBody: JSON.stringify({
          exchange: "binance",
          apiKey: "xxx",
          apiSecret: "xxx",
          permissions: ["read"]
        }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          data: {
            accountId: "acc_k1l2m3n4",
            exchange: "binance",
            status: "connected",
            permissions: ["read"],
            connectedAt: "2026-03-04T14:30:00Z",
            lastSync: "2026-03-04T14:30:00Z"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/accounts/positions',
        description: 'استرجاع جميع المراكز المفتوحة من الحسابات المربوطة مع بيانات الربح/الخسارة',
        permission: 'read',
        requestBody: undefined,
        responseExample: JSON.stringify({
          success: true,
          data: {
            positions: [
              {
                id: "pos_a1b2c3",
                symbol: "BTC/USDT",
                side: "long",
                entryPrice: 95000.00,
                currentPrice: 97542.50,
                quantity: 0.05,
                pnl: 127.13,
                pnlPercent: 2.68,
                stopLoss: 92000.00,
                takeProfit: 105000.00,
                openedAt: "2026-03-02T08:00:00Z",
                sourceAccount: "acc_k1l2m3n4"
              }
            ],
            totalPnl: 127.13,
            count: 1
          }
        }, null, 2),
      },
      {
        method: 'DELETE',
        path: '/accounts/:id',
        description: 'إلغاء ربط حساب بورصة مع الحفاظ على البيانات التاريخية',
        permission: 'read',
        requestBody: undefined,
        responseExample: JSON.stringify({
          success: true,
          data: {
            accountId: "acc_k1l2m3n4",
            status: "unlinked",
            historicalDataPreserved: true,
            unlinkedAt: "2026-03-04T14:35:00Z"
          }
        }, null, 2),
      },
    ],
  },
  {
    id: 'ai',
    title: 'الذكاء الاصطناعي',
    icon: <Brain size={18} />,
    iconColor: T.purple,
    iconBg: `${T.purple}14`,
    description: 'تحليلات ذكية ونماذج AI ومحادثة',
    endpoints: [
      {
        method: 'POST',
        path: '/ai/analyze',
        description: 'تحليل ذكي شامل لأصل مالي يجمع بين المؤشرات الفنية وتحليل المشاعر',
        permission: 'read',
        requestBody: JSON.stringify({
          symbol: "BTC/USDT",
          timeframe: "4h",
          models: ["gemini", "groq", "glm4"],
          includeSentiment: true,
          includePatterns: true
        }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          data: {
            symbol: "BTC/USDT",
            consensus: "bullish",
            confidence: 78.5,
            models: [
              {
                name: "gemini",
                recommendation: "buy",
                confidence: 82,
                summary: "إشارة شراء قوية مع زخم إيجابي"
              },
              {
                name: "groq",
                recommendation: "buy",
                confidence: 75,
                summary: "اتجاه صاعد مع تأكيد RSI"
              }
            ],
            sentiment: { score: 0.65, label: "إيجابي" },
            keyLevels: {
              support: [95000, 93000],
              resistance: [100000, 105000]
            }
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/ai/models',
        description: 'قائمة بجميع نماذج الذكاء الاصطناعي المتاحة وحالتها وحدود الاستخدام',
        permission: 'read',
        requestBody: undefined,
        responseExample: JSON.stringify({
          success: true,
          data: {
            models: [
              {
                id: "gemini",
                name: "Gemini Pro",
                status: "online",
                latency: 450,
                dailyLimit: 100,
                dailyUsed: 23,
                tier: "PRO"
              },
              {
                id: "groq",
                name: "Groq Mixtral",
                status: "online",
                latency: 120,
                dailyLimit: 200,
                dailyUsed: 67,
                tier: "PRO"
              },
              {
                id: "glm4",
                name: "GLM-4",
                status: "online",
                latency: 380,
                dailyLimit: 150,
                dailyUsed: 45,
                tier: "PREMIUM"
              }
            ]
          }
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/ai/chat',
        description: 'محادثة تفاعلية مع مساعد AI متخصص في التداول والتحليل المالي',
        permission: 'read',
        requestBody: JSON.stringify({
          message: "ما هو أفضل وقت لدخول صفقة شراء على BTC؟",
          context: {
            symbol: "BTC/USDT",
            timeframe: "1h"
          },
          conversationId: "conv_abc123"
        }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          data: {
            conversationId: "conv_abc123",
            message: "بناءً على التحليل الفني الحالي، يظهر BTC/USDT نمط تصحيحي عند مستوى 97000. أنصح بالانتظار حتى تأكيد الاختراق فوق 98500 مع حجم تداول مرتفع. وقف الخسارة المقترح تحت 95200.",
            sources: ["technical_analysis", "pattern_recognition"],
            confidence: 72,
            timestamp: "2026-03-04T14:30:00Z"
          }
        }, null, 2),
      },
    ],
  },
  {
    id: 'signals',
    title: 'الإشارات',
    icon: <Radio size={18} />,
    iconColor: T.amber,
    iconBg: `${T.amber}14`,
    description: 'إشارات التداول الذكية والنشطة',
    endpoints: [
      {
        method: 'POST',
        path: '/signals/generate/:pair',
        description: 'توليد إشارة تداول ذكية لزوج محدد بناءً على تحليل AI متعدد النماذج',
        permission: 'read',
        requestBody: JSON.stringify({
          timeframe: "4h",
          strategy: "swing",
          riskLevel: "moderate"
        }, null, 2),
        responseExample: JSON.stringify({
          success: true,
          data: {
            signalId: "sig_m3n4o5p6",
            pair: "BTC/USDT",
            direction: "long",
            confidence: 85,
            entry: 97500.00,
            stopLoss: 95000.00,
            takeProfit: [
              { level: 1, price: 101000.00, ratio: 0.5 },
              { level: 2, price: 105000.00, ratio: 0.5 }
            ],
            riskReward: "1:2.8",
            reasoning: "اختراق مقاومة مع تأكيد RSI وحجم تداول مرتفع",
            models: ["gemini", "groq", "glm4"],
            createdAt: "2026-03-04T14:30:00Z",
            expiresAt: "2026-03-05T02:30:00Z"
          }
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/signals/active',
        description: 'قائمة بجميع الإشارات النشطة غير المنتهية مع حالتها وأدائها',
        permission: 'read',
        requestBody: undefined,
        responseExample: JSON.stringify({
          success: true,
          data: {
            signals: [
              {
                signalId: "sig_m3n4o5p6",
                pair: "BTC/USDT",
                direction: "long",
                confidence: 85,
                status: "active",
                entry: 97500.00,
                currentPrice: 98200.00,
                pnl: 0.72,
                createdAt: "2026-03-04T14:30:00Z"
              },
              {
                signalId: "sig_q7r8s9t0",
                pair: "ETH/USDT",
                direction: "short",
                confidence: 72,
                status: "hit_tp1",
                entry: 3850.00,
                currentPrice: 3780.00,
                pnl: 1.82,
                createdAt: "2026-03-03T20:00:00Z"
              }
            ],
            count: 2
          }
        }, null, 2),
      },
    ],
  },
]

/* ═══════════════════════════════════════════════════════
   Mock API Keys Data
═══════════════════════════════════════════════════════ */
interface ApiKey {
  id: string
  name: string
  key: string
  lastUsed: string
  permissions: ('read')[]
  status: 'active' | 'revoked'
  createdAt: string
}

const INITIAL_API_KEYS: ApiKey[] = [
  {
    id: 'key_prod_001',
    name: 'Production Key',
    key: 'roua_live_sk_a1b2c3d4e5f6g7h8i9j0',
    lastUsed: 'منذ 5 دقائق',
    permissions: ['read'],
    status: 'active',
    createdAt: '2025/11/15',
  },
  {
    id: 'key_dev_002',
    name: 'Development Key',
    key: 'roua_test_sk_z9y8x7w6v5u4t3s2r1q0',
    lastUsed: 'منذ 3 ساعات',
    permissions: ['read'],
    status: 'active',
    createdAt: '2026/01/08',
  },
]

/* ═══════════════════════════════════════════════════════
   Error Codes Data
═══════════════════════════════════════════════════════ */
interface ErrorCode {
  httpStatus: number
  code: string
  description: string
  solution: string
}

const ERROR_CODES: ErrorCode[] = [
  { httpStatus: 400, code: 'BAD_REQUEST', description: 'طلب غير صالح — بيانات مفقودة أو تنسيق خاطئ', solution: 'تحقق من هيكل الطلب والبيانات المطلوبة' },
  { httpStatus: 401, code: 'UNAUTHORIZED', description: 'غير مصادق — رمز الوصول مفقود أو منتهي الصلاحية', solution: 'أعد المصادقة أو جدّد رمز الوصول عبر /auth/refresh' },
  { httpStatus: 403, code: 'FORBIDDEN', description: 'ممنوع — لا تملك الصلاحيات الكافية لهذا الإجراء', solution: 'تحقق من صلاحيات مفتاح API أو رقِّ خطتك' },
  { httpStatus: 404, code: 'NOT_FOUND', description: 'غير موجود — المسار أو المورد المطلوب غير موجود', solution: 'تحقق من صحة المسار ومعرف المورد' },
  { httpStatus: 429, code: 'RATE_LIMITED', description: 'تجاوز الحد — عدد الطلبات أعلى من المسموح', solution: 'انتظر حتى انتهاء فترة التبريد أو رقِّ خطتك' },
  { httpStatus: 500, code: 'INTERNAL_ERROR', description: 'خطأ داخلي — خطأ غير متوقع في الخادم', solution: 'أعد المحاولة لاحقاً أو تواصل مع الدعم الفني' },
  { httpStatus: 503, code: 'SERVICE_UNAVAILABLE', description: 'الخدمة غير متاحة — صيانة أو حمل زائد', solution: 'انتظر بضع دقائق وأعد المحاولة' },
  { httpStatus: 400, code: 'INVALID_SYMBOL', description: 'رمز غير صالح — زوج التداول غير مدعوم', solution: 'تحقق من قائمة الأزواج المدعومة عبر /exchange/quote' },
  { httpStatus: 400, code: 'INVALID_API_KEY', description: 'مفتاح API غير صالح — فشل الاتصال بالبورصة', solution: 'تحقق من صحة مفتاح API والسري لديك' },
]

/* ═══════════════════════════════════════════════════════
   Webhook Events Data
═══════════════════════════════════════════════════════ */
const WEBHOOK_EVENTS = [
  { event: 'order.filled', description: 'تم تنفيذ الأمر بالكامل', color: T.green },
  { event: 'order.partial', description: 'تم تنفيذ الأمر جزئياً', color: T.cyan },
  { event: 'order.cancelled', description: 'تم إلغاء الأمر', color: T.red },
  { event: 'position.opened', description: 'تم فتح مركز جديد', color: T.green },
  { event: 'position.closed', description: 'تم إغلاق مركز', color: T.amber },
  { event: 'signal.generated', description: 'تم توليد إشارة تداول جديدة', color: T.purple },
  { event: 'price.alert', description: 'تنبيه سعر — تم الوصول للسعر المستهدف', color: T.cyan },
  { event: 'ai.analysis_complete', description: 'اكتمل تحليل AI', color: T.purple },
  { event: 'account.connected', description: 'تم ربط حساب بورصة جديد', color: T.green },
]

/* ═══════════════════════════════════════════════════════
   Endpoint Accordion Item
═══════════════════════════════════════════════════════ */
function EndpointItem({ endpoint, isOpen, onToggle }: { endpoint: Endpoint; isOpen: boolean; onToggle: () => void }) {
  const mc = METHOD_COLORS[endpoint.method]

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 0', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'right' as const,
          transition: 'background 0.2s',
        }}
      >
        {/* Method Badge */}
        <span style={{
          padding: '3px 10px', borderRadius: 6,
          background: mc.bg, color: mc.text, border: `1px solid ${mc.border}`,
          fontSize: 10, fontWeight: 800,
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0, letterSpacing: 0.5,
          minWidth: 52, textAlign: 'center',
        }}>
          {endpoint.method}
        </span>

        {/* Path */}
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: 600,
          color: isOpen ? T.text : T.text2,
          fontFamily: "'JetBrains Mono', monospace",
          direction: 'ltr' as const, textAlign: 'left',
          transition: 'color 0.2s',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {endpoint.path}
        </span>

        {/* Description */}
        <span style={{
          flex: 2, fontSize: 11.5, color: T.text3,
          fontFamily: "'Cairo', sans-serif",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {endpoint.description}
        </span>

        {/* Permission Badge */}
        <span style={{
          padding: '2px 8px', borderRadius: 6,
          background: endpoint.permission === 'none' ? `${T.text4}14` : `${T.green}14`,
          color: endpoint.permission === 'none' ? T.text4 : T.green,
          fontSize: 9, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
          border: `1px solid ${endpoint.permission === 'none' ? `${T.text4}25` : `${T.green}25`}`,
          flexShrink: 0,
        }}>
          {endpoint.permission === 'none' ? 'عام' : 'قراءة'}
        </span>

        {/* Chevron */}
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isOpen ? `${T.cyan}14` : T.surface,
          transition: 'all 0.3s',
        }}>
          <ChevronDown
            size={13}
            color={isOpen ? T.cyan : T.text4}
            style={{
              transition: 'transform 0.3s',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </button>

      {/* Expanded Content */}
      <div style={{
        maxHeight: isOpen ? 1200 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.4s ease-in-out, opacity 0.3s',
        opacity: isOpen ? 1 : 0,
      }}>
        <div style={{ padding: '0 0 16px 0' }}>
          {/* Description */}
          <div style={{
            fontSize: 12, color: T.text3, lineHeight: 1.8,
            fontFamily: "'Cairo', sans-serif", marginBottom: 12,
            padding: '8px 12px', borderRadius: 8,
            background: `${T.cyan}04`, border: `1px solid ${T.cyan}08`,
          }}>
            <Info size={12} color={T.cyan} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 6 }} />
            {endpoint.description}
          </div>

          {/* Request Body */}
          {endpoint.requestBody && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 4,
                fontFamily: "'Cairo', sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Send size={11} color={T.cyan} />
                Request Body
              </div>
              <CodeBlock code={endpoint.requestBody} language="json" />
            </div>
          )}

          {/* Response Example */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 4,
              fontFamily: "'Cairo', sans-serif",
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <FileJson size={11} color={T.green} />
              Response Example
            </div>
            <CodeBlock code={endpoint.responseExample} language="json" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Category Accordion Section
═══════════════════════════════════════════════════════ */
function CategorySection({
  category,
  openEndpoints,
  onToggleEndpoint,
  isCategoryOpen,
  onToggleCategory,
}: {
  category: EndpointCategory
  openEndpoints: Set<string>
  onToggleEndpoint: (id: string) => void
  isCategoryOpen: boolean
  onToggleCategory: () => void
}) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Category Header */}
      <button
        onClick={onToggleCategory}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'right' as const,
          borderBottom: isCategoryOpen ? `1px solid ${T.border}` : 'none',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: category.iconBg, flexShrink: 0,
          color: category.iconColor,
        }}>
          {category.icon}
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
            {category.title}
          </div>
          <div style={{ fontSize: 10, color: T.text4, marginTop: 1, fontFamily: "'Cairo', sans-serif" }}>
            {category.description}
          </div>
        </div>
        <span style={{
          fontSize: 9, padding: '3px 8px', borderRadius: 10,
          background: `${category.iconColor}10`, color: category.iconColor,
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
        }}>
          {category.endpoints.length}
        </span>
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isCategoryOpen ? `${category.iconColor}14` : T.surface,
          transition: 'all 0.3s',
        }}>
          <ChevronDown
            size={14}
            color={isCategoryOpen ? category.iconColor : T.text4}
            style={{
              transition: 'transform 0.3s',
              transform: isCategoryOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </button>

      {/* Endpoints List */}
      <div style={{
        maxHeight: isCategoryOpen ? 5000 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.4s ease-in-out',
      }}>
        <div style={{ padding: '0 20px' }}>
          {category.endpoints.map(ep => (
            <EndpointItem
              key={`${category.id}-${ep.method}-${ep.path}`}
              endpoint={ep}
              isOpen={openEndpoints.has(`${category.id}-${ep.path}`)}
              onToggle={() => onToggleEndpoint(`${category.id}-${ep.path}`)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main API Docs Page
═══════════════════════════════════════════════════════ */
export default function ApiDocsPage() {
  useScopedStyle(`@media (max-width: 767px) {
          .apidocs-grid-2 { grid-template-columns: 1fr !important; }
          .apidocs-grid-3 { grid-template-columns: 1fr !important; }
          .apidocs-content { padding: 12px !important; }
          .apidocs-header-inner { flex-direction: column !important; align-items: flex-start !important; }
          .apidocs-endpoint-row { flex-direction: column !important; gap: 4px !important; }
          .apidocs-endpoint-row span { white-space: normal !important; }
          .apidocs-key-row { flex-direction: column !important; align-items: flex-start !important; }
          .apidocs-quick-grid { grid-template-columns: 1fr !important; }
          .apidocs-sdk-tabs { flex-direction: column !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .apidocs-quick-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        pre::-webkit-scrollbar { height: 4px; }
        pre::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 4px; }
        pre::-webkit-scrollbar-track { background: transparent; }
        @keyframes apidocs-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .apidocs-fade-in { animation: apidocs-fade-in 0.4s ease-out; }
@keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }`)

  const [openEndpoints, setOpenEndpoints] = useState<Set<string>>(new Set())
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['auth']))
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(INITIAL_API_KEYS)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'js' | 'python'>('js')

  /* ── Toggle Endpoint ── */
  const toggleEndpoint = useCallback((id: string) => {
    setOpenEndpoints(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ── Toggle Category ── */
  const toggleCategory = useCallback((id: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ── Generate New API Key ── */
  const handleGenerateKey = useCallback(() => {
    setGenerating(true)
    setTimeout(() => {
      const newKey: ApiKey = {
        id: `key_new_${Date.now()}`,
        name: `New Key ${apiKeys.length + 1}`,
        key: `roua_test_sk_${Math.random().toString(36).slice(2, 22)}`,
        lastUsed: 'لم يُستخدم بعد',
        permissions: ['read'],
        status: 'active',
        createdAt: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      }
      setApiKeys(prev => [...prev, newKey])
      setGenerating(false)
      toast({ title: 'تم إنشاء مفتاح جديد', description: 'تأكد من حفظ المفتاح — لن يتم عرضه مرة أخرى' })
    }, 1200)
  }, [apiKeys.length])

  /* ── Revoke API Key ── */
  const handleRevokeKey = useCallback((keyId: string) => {
    setApiKeys(prev => prev.map(k => k.id === keyId ? { ...k, status: 'revoked' as const } : k))
    toast({ title: 'تم إلغاء المفتاح', description: 'لم يعد هذا المفتاح صالحاً للاستخدام', variant: 'destructive' })
  }, [])

  /* ── Toggle Key Visibility ── */
  const toggleKeyVisibility = useCallback((keyId: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev)
      if (next.has(keyId)) next.delete(keyId)
      else next.add(keyId)
      return next
    })
  }, [])

  /* ── SDK Code Snippets ── */
  const sdkSnippets = {
    js: `import { RouaClient } from '@roua/sdk';

// Initialize the client
const roua = new RouaClient({
  apiKey: 'roua_live_sk_your_key_here',
  baseURL: 'https://api.roua.io/v1'
});

// Get live quote
const quote = await roua.markets.getQuote('BTC/USDT');
console.log(\`BTC Price: \${quote.price}\`);

// Link a new exchange account
const account = await roua.accounts.linkAccount({
  exchange: 'binance',
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret',
  permissions: ['read'],
});

// Get positions from linked accounts
const positions = await roua.accounts.getPositions();

// Get AI analysis
const analysis = await roua.ai.analyze({
  symbol: 'BTC/USDT',
  timeframe: '4h',
  models: ['gemini', 'groq'],
});

// Subscribe to signals
roua.signals.onGenerated((signal) => {
  console.log(\`New Signal: \${signal.direction} \${signal.pair}\`);
});`,
    python: `from roua import RouaClient

# Initialize the client
client = RouaClient(
    api_key="roua_live_sk_your_key_here",
    base_url="https://api.roua.io/v1"
)

# Get live quote
quote = client.markets.get_quote("BTC/USDT")
print(f"BTC Price: {quote.price}")

# Link a new exchange account
account = client.accounts.link_account(
    exchange="binance",
    api_key="your_api_key",
    api_secret="your_api_secret",
    permissions=["read"],
)

# Get positions from linked accounts
positions = client.accounts.get_positions()

# Get AI analysis
analysis = client.ai.analyze(
    symbol="BTC/USDT",
    timeframe="4h",
    models=["gemini", "groq"],
)

# Subscribe to signals
for signal in client.signals.stream():
    print(f"New Signal: {signal.direction} {signal.pair}")`,
  }

  return (
    <div
      className="custom-scrollbar"
      style={{
        direction: 'rtl',
        fontFamily: "'Cairo', sans-serif",
        height: '100%',
        overflowY: 'auto',
        background: T.bg,
      }}
    >
      {/* Scoped styles via useScopedStyle */}{/* ═══ Header ═══ */}
      <div style={{
        padding: '28px 24px 20px',
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg2}, ${T.bg})`,
      }}>
        <div className="apidocs-header-inner" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 20px ${T.cyan}30`,
            flexShrink: 0,
          }}>
            <Code size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif", display: 'flex', alignItems: 'center', gap: 10 }}>
              توثيق API
              <span style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 10,
                background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
                color: '#000', fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: `0 0 12px ${T.cyan}30`,
                letterSpacing: 0.5,
              }}>
                v1.0
              </span>
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
              المرجع الشامل لواجهة برمجة تطبيقات منصة رؤى — ابدأ البناء والتكامل في دقائق
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="apidocs-content" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>

        {/* ═══ Quick Stats ═══ */}
        <div className="apidocs-quick-grid apidocs-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { icon: <Globe size={16} />, label: 'الرابط الأساسي', value: 'api.roua.io/v1', color: T.cyan, bg: `${T.cyan}14` },
            { icon: <Shield size={16} />, label: 'المصادقة', value: 'Bearer Token', color: T.green, bg: `${T.green}14` },
            { icon: <Zap size={16} />, label: 'الحد الأقصى', value: '100 طلب/دقيقة', color: T.amber, bg: `${T.amber}14` },
            { icon: <Lock size={16} />, label: 'التشفير', value: 'TLS 1.3', color: T.purple, bg: `${T.purple}14` },
          ].map((stat, i) => (
            <div key={i} style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: stat.bg, color: stat.color, flexShrink: 0,
              }}>
                {stat.icon}
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'left' }}>
                  {stat.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ Getting Started ═══ */}
        <section aria-labelledby="getting-started-heading" className="apidocs-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.cyan}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={14} color={T.cyan} />
            </div>
            <h2 id="getting-started-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "'Cairo', sans-serif" }}>
              البدء السريع
            </h2>
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Base URL */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Globe size={14} color={T.cyan} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                  الرابط الأساسي (Base URL)
                </span>
              </div>
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: '#07080E', border: `1px solid ${T.border2}`,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                color: T.cyan, direction: 'ltr', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: T.text4 }}>https://</span>
                <span style={{ color: T.text }}>api.roua.io</span>
                <span style={{ color: T.text4 }}>/</span>
                <span style={{ color: T.green }}>v1</span>
              </div>
            </div>

            {/* Authentication */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Shield size={14} color={T.green} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                  المصادقة (Authentication)
                </span>
              </div>
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: `${T.green}06`, border: `1px solid ${T.green}12`,
                fontSize: 11.5, color: T.text3, lineHeight: 1.8,
                fontFamily: "'Cairo', sans-serif", marginBottom: 10,
              }}>
                جميع الطلبات المحمية تتطلب ترويسة <code style={{ color: T.green, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>Authorization</code> مع رمز Bearer.
                يمكنك الحصول على رمز الوصول عبر نقطة نهاية المصادقة OTP أو باستخدام مفاتيح API.
              </div>
              <CodeBlock
                language="http"
                code={`Authorization: Bearer eyJhbGciOiJIUzI1NiIs...\nX-API-Key: roua_live_sk_your_key_here`}
              />
            </div>

            {/* Rate Limits */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Zap size={14} color={T.amber} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                  حدود الطلبات (Rate Limits)
                </span>
              </div>
              <div className="apidocs-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { plan: 'مجاني', limit: '30', unit: 'طلب/دقيقة', color: T.text4 },
                  { plan: 'برو', limit: '100', unit: 'طلب/دقيقة', color: T.cyan },
                  { plan: 'متميز+', limit: '500', unit: 'طلب/دقيقة', color: T.amber },
                ].map((r, i) => (
                  <div key={i} style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: T.surface, border: `1px solid ${T.border}`,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, color: T.text4, marginBottom: 4, fontFamily: "'Cairo', sans-serif" }}>{r.plan}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: r.color, fontFamily: "'JetBrains Mono', monospace" }}>{r.limit}</div>
                    <div style={{ fontSize: 9, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>{r.unit}</div>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 8,
                background: `${T.amber}06`, border: `1px solid ${T.amber}10`,
                fontSize: 10.5, color: T.text3, lineHeight: 1.7,
                fontFamily: "'Cairo', sans-serif",
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertTriangle size={12} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
                عند تجاوز الحد، يُرجع الخادم خطأ 429 مع ترويسة <code style={{ color: T.amber, fontFamily: "'JetBrains Mono', monospace" }}>Retry-After</code> تحدد وقت الانتظار بالثواني.
              </div>
            </div>

            {/* Example curl Command */}
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Terminal size={14} color={T.purple} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                  مثال على طلب (curl)
                </span>
              </div>
              <CodeBlock
                language="bash"
                code={`curl -X GET "https://api.roua.io/v1/exchange/quote/BTC-USDT" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "X-API-Key: roua_live_sk_your_key_here" \\
  -H "Content-Type: application/json"`}
              />
            </div>
          </div>
        </section>

        {/* ═══ API Key Management ═══ */}
        <section aria-labelledby="api-keys-heading" className="apidocs-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.green}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Key size={14} color={T.green} />
            </div>
            <h2 id="api-keys-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "'Cairo', sans-serif" }}>
              إدارة مفاتيح API
            </h2>
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Generate Button */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>مفاتيح API الخاصة بك</div>
                <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
                  استخدم مفاتيح API للوصول البرمجي إلى المنصة — لا تشاركها مع أي شخص
                </div>
              </div>
              <button
                onClick={handleGenerateKey}
                disabled={generating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${T.green}, ${T.greenDim})`,
                  color: '#000', fontSize: 12, fontWeight: 800, cursor: generating ? 'wait' : 'pointer',
                  fontFamily: "'Cairo', sans-serif", border: 'none', transition: 'all 0.2s',
                  boxShadow: `0 0 16px ${T.green}20`,
                  opacity: generating ? 0.7 : 1,
                }}
              >
                {generating ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
                {generating ? 'جاري الإنشاء...' : 'إنشاء مفتاح جديد'}
              </button>
            </div>

            {/* Permission Legend */}
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { perm: 'read', label: 'قراءة', color: T.green, desc: 'قراءة البيانات والمتابعة' },
                { perm: 'withdraw', label: 'سحب', color: T.red, desc: 'معطل دائماً لحماية أموالك', disabled: true },
              ].map(p => (
                <div key={p.perm} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 8,
                  background: p.disabled ? `${T.red}06` : `${p.color}06`,
                  border: `1px solid ${p.disabled ? `${T.red}15` : `${p.color}15`}`,
                  opacity: p.disabled ? 0.6 : 1,
                }}>
                  {p.disabled ? <Lock size={10} color={T.red} /> : <Check size={10} color={p.color} />}
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: p.disabled ? T.red : p.color,
                    fontFamily: "'Cairo', sans-serif",
                    textDecoration: p.disabled ? 'line-through' : 'none',
                  }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: 9, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>
                    {p.desc}
                  </span>
                </div>
              ))}
            </div>

            {/* API Keys List */}
            <div style={{ padding: '0 20px' }}>
              {apiKeys.map(k => (
                <div key={k.id} style={{
                  padding: '14px 0',
                  borderBottom: `1px solid ${T.border}`,
                }}>
                  <div className="apidocs-key-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: k.status === 'active' ? `${T.green}14` : `${T.red}14`,
                      color: k.status === 'active' ? T.green : T.red,
                      flexShrink: 0,
                    }}>
                      <Key size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: k.status === 'revoked' ? T.text4 : T.text, fontFamily: "'Cairo', sans-serif", textDecoration: k.status === 'revoked' ? 'line-through' : 'none' }}>
                        {k.name}
                      </div>
                      <div style={{
                        fontSize: 10, color: T.text4,
                        fontFamily: "'JetBrains Mono', monospace",
                        direction: 'ltr', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginTop: 2,
                      }}>
                        <span style={{ color: T.text4 }}>{visibleKeys.has(k.id) ? k.key : k.key.slice(0, 14) + '••••••••••••'}</span>
                        <button
                          onClick={() => toggleKeyVisibility(k.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text4, padding: 0, display: 'flex' }}
                          aria-label={visibleKeys.has(k.id) ? 'إخفاء المفتاح' : 'عرض المفتاح'}
                        >
                          {visibleKeys.has(k.id) ? <EyeOff size={11} /> : <Eye size={11} />}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {/* Permissions */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {k.permissions.map(p => (
                          <span key={p} style={{
                            padding: '2px 7px', borderRadius: 5,
                            background: p === 'read' ? `${T.green}14` : `${T.text4}14`,
                            color: p === 'read' ? T.green : T.text4,
                            fontSize: 9, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                          }}>
                            {p === 'read' ? 'قراءة' : '—'}
                          </span>
                        ))}
                      </div>
                      {/* Last Used */}
                      <span style={{
                        fontSize: 9, color: T.text4, fontFamily: "'Cairo', sans-serif",
                        padding: '2px 8px', background: T.surface, borderRadius: 5,
                        border: `1px solid ${T.border}`,
                      }}>
                        <Clock size={8} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 3 }} />
                        {k.lastUsed}
                      </span>
                      {/* Revoke Button */}
                      {k.status === 'active' ? (
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            background: `${T.red}10`, border: `1px solid ${T.red}20`,
                            color: T.red, fontSize: 10, fontWeight: 700,
                            fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${T.red}20`; e.currentTarget.style.borderColor = `${T.red}40` }}
                          onMouseLeave={e => { e.currentTarget.style.background = `${T.red}10`; e.currentTarget.style.borderColor = `${T.red}20` }}
                        >
                          <Trash2 size={10} />
                          إلغاء
                        </button>
                      ) : (
                        <span style={{
                          fontSize: 9, padding: '3px 8px', borderRadius: 5,
                          background: `${T.red}14`, color: T.red, fontWeight: 700,
                          fontFamily: "'Cairo', sans-serif",
                          border: `1px solid ${T.red}25`,
                        }}>
                          ملغى
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ Endpoint Categories ═══ */}
        <section aria-labelledby="endpoints-heading" className="apidocs-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: `${T.purple}14`, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Braces size={14} color={T.purple} />
              </div>
              <h2 id="endpoints-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "'Cairo', sans-serif" }}>
                نقاط النهاية (Endpoints)
              </h2>
            </div>
            <span style={{
              fontSize: 10, color: T.text4,
              fontFamily: "'JetBrains Mono', monospace",
              padding: '3px 10px', borderRadius: 10, background: T.surface,
              border: `1px solid ${T.border}`,
            }}>
              {ENDPOINT_CATEGORIES.reduce((s, c) => s + c.endpoints.length, 0)} نقطة نهاية
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ENDPOINT_CATEGORIES.map(cat => (
              <CategorySection
                key={cat.id}
                category={cat}
                openEndpoints={openEndpoints}
                onToggleEndpoint={toggleEndpoint}
                isCategoryOpen={openCategories.has(cat.id)}
                onToggleCategory={() => toggleCategory(cat.id)}
              />
            ))}
          </div>
        </section>

        {/* ═══ SDKs Section ═══ */}
        <section aria-labelledby="sdks-heading" className="apidocs-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.amber}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Terminal size={14} color={T.amber} />
            </div>
            <h2 id="sdks-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "'Cairo', sans-serif" }}>
              حزم التطوير (SDKs)
            </h2>
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Tab Header */}
            <div className="apidocs-sdk-tabs" style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
              {[
                { id: 'js' as const, label: 'JavaScript / Node.js', icon: '🟨', color: T.amber },
                { id: 'python' as const, label: 'Python', icon: '🐍', color: T.green },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '14px 12px', border: 'none', cursor: 'pointer',
                    background: activeTab === tab.id ? `${tab.color}08` : 'transparent',
                    color: activeTab === tab.id ? tab.color : T.text3,
                    fontSize: 12, fontWeight: activeTab === tab.id ? 800 : 500,
                    fontFamily: "'Cairo', sans-serif",
                    borderBottom: activeTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Install Command */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 6, fontFamily: "'Cairo', sans-serif" }}>
                التثبيت
              </div>
              <CodeBlock
                language="bash"
                code={activeTab === 'js' ? 'npm install @roua/sdk' : 'pip install roua-sdk'}
              />
            </div>

            {/* Code Snippet */}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 6, fontFamily: "'Cairo', sans-serif" }}>
                مثال شامل
              </div>
              <CodeBlock
                language={activeTab === 'js' ? 'javascript' : 'python'}
                code={sdkSnippets[activeTab]}
              />
            </div>
          </div>
        </section>

        {/* ═══ Webhooks Section ═══ */}
        <section aria-labelledby="webhooks-heading" className="apidocs-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.cyan}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Webhook size={14} color={T.cyan} />
            </div>
            <h2 id="webhooks-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "'Cairo', sans-serif" }}>
              Webhooks
            </h2>
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Setup Instructions */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Server size={14} color={T.cyan} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                  إعداد Webhooks
                </span>
              </div>
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: `${T.cyan}06`, border: `1px solid ${T.cyan}12`,
                fontSize: 11.5, color: T.text3, lineHeight: 1.8,
                fontFamily: "'Cairo', sans-serif", marginBottom: 12,
              }}>
                تتيح لك Webhooks استلام إشعارات فورية عند حدوث أحداث معينة في حسابك.
                قم بتسجيل عنوان URL الخاص بخادمك وسيتم إرسال طلب POST لكل حدث مشترك.
                جميع الطلبات موقّعة باستخدام HMAC-SHA256 للتحقق من المصدر.
              </div>
              <CodeBlock
                language="bash"
                code={`# Register a webhook endpoint\ncurl -X POST "https://api.roua.io/v1/webhooks" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{\n    "url": "https://your-server.com/webhooks/roua",\n    "events": ["order.filled", "signal.generated", "price.alert"],\n    "secret": "whsec_your_webhook_secret"\n  }'`}
              />
            </div>

            {/* Event Types */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 10 }}>
                أنواع الأحداث
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }} className="apidocs-grid-2">
                {WEBHOOK_EVENTS.map(ev => (
                  <div key={ev.event} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8,
                    background: T.surface, border: `1px solid ${T.border}`,
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: ev.color, boxShadow: `0 0 6px ${ev.color}50`,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 10, color: ev.color,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700, direction: 'ltr',
                    }}>
                      {ev.event}
                    </span>
                    <span style={{ fontSize: 10, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
                      {ev.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payload Example */}
            <div style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>
                مثال على الحمولة (Payload)
              </div>
              <CodeBlock
                language="json"
                code={JSON.stringify({
                  event: "order.filled",
                  timestamp: "2026-03-04T14:35:22Z",
                  data: {
                    orderId: "ord_x9y8z7w6",
                    symbol: "BTC/USDT",
                    side: "buy",
                    type: "limit",
                    quantity: 0.01,
                    price: 97000.00,
                    filledAt: "2026-03-04T14:35:22Z",
                    commission: 0.97
                  },
                  signature: "sha256=a1b2c3d4e5f6..."
                }, null, 2)}
              />
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 8,
                background: `${T.green}06`, border: `1px solid ${T.green}10`,
                fontSize: 10.5, color: T.text3, lineHeight: 1.7,
                fontFamily: "'Cairo', sans-serif",
                display: 'flex', alignItems: 'flex-start', gap: 6,
              }}>
                <Shield size={11} color={T.green} style={{ flexShrink: 0, marginTop: 2 }} />
                تحقق دائماً من صحة التوقيع باستخدام المفتاح السري المشترك قبل معالجة أي حمولة.
                استخدم خوارزمية HMAC-SHA256 مع حقل <code style={{ color: T.green, fontFamily: "'JetBrains Mono', monospace" }}>signature</code> للتحقق.
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Error Codes Reference ═══ */}
        <section aria-labelledby="errors-heading" className="apidocs-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.red}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={14} color={T.red} />
            </div>
            <h2 id="errors-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "'Cairo', sans-serif" }}>
              مرجع رموز الأخطاء
            </h2>
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 140px 1fr 1fr',
              padding: '12px 20px', borderBottom: `1px solid ${T.border}`,
              background: `${T.surface}40`,
              fontSize: 10, fontWeight: 800, color: T.text4,
              fontFamily: "'Cairo', sans-serif",
            }}>
              <span>الحالة</span>
              <span>الرمز</span>
              <span>الوصف</span>
              <span>الحل</span>
            </div>
            {/* Table Rows */}
            {ERROR_CODES.map((err, i) => (
              <div
                key={i}
                style={{
                  display: 'grid', gridTemplateColumns: '80px 140px 1fr 1fr',
                  padding: '10px 20px',
                  borderBottom: i < ERROR_CODES.length - 1 ? `1px solid ${T.border}` : 'none',
                  alignItems: 'center', fontSize: 11,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${T.surface}30` }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {/* HTTP Status */}
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 800,
                  color: err.httpStatus >= 500 ? T.red :
                         err.httpStatus >= 400 ? T.amber : T.green,
                  fontSize: 12,
                }}>
                  {err.httpStatus}
                </span>
                {/* Error Code */}
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: T.cyan, fontSize: 10, fontWeight: 600,
                  direction: 'ltr',
                }}>
                  {err.code}
                </span>
                {/* Description */}
                <span style={{
                  color: T.text2, fontFamily: "'Cairo', sans-serif",
                  lineHeight: 1.5,
                }}>
                  {err.description}
                </span>
                {/* Solution */}
                <span style={{
                  color: T.text4, fontFamily: "'Cairo', sans-serif",
                  lineHeight: 1.5,
                }}>
                  {err.solution}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ Footer Note ═══ */}
        <div style={{
          padding: '20px', textAlign: 'center',
          borderTop: `1px solid ${T.border}`,
          marginTop: 8,
        }}>
          <div style={{ fontSize: 11, color: T.text4, fontFamily: "'Cairo', sans-serif", lineHeight: 1.8 }}>
            توثيق API لمنصة رؤى — الإصدار 1.0 — آخر تحديث: مارس 2026
          </div>
          <div style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>
            هل تحتاج مساعدة؟{' '}
            <span style={{ color: T.cyan, cursor: 'pointer', fontWeight: 700 }}>تواصل مع الدعم الفني</span>
            {' '}أو{' '}
            <span style={{ color: T.cyan, cursor: 'pointer', fontWeight: 700 }}>زور مركز المساعدة</span>
          </div>
        </div>
      </div>

      {/* Spin animation for loading */}
      {/* Scoped styles via useScopedStyle */}</div>
  )
}
