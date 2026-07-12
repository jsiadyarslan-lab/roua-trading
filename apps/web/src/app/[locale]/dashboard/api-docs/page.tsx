'use client'

import { useState, useCallback } from 'react'
import {
  Code, ChevronDown, Copy, Check, Key, Shield, Zap, Clock,
  Globe, Lock, Eye, EyeOff, Trash2, Plus, Terminal, FileJson,
  Braces, Webhook, AlertTriangle, Info, RefreshCw, Send,
  BarChart3, Brain, Radio, TrendingUp, Server, BookOpen
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { T } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl'

/* ═══════════════════════════════════════════════════════
   Design Tokens (canonical + local extensions)
═══════════════════════════════════════════════════════ */
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
   Data Types
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

interface ApiKey {
  id: string
  name: string
  key: string
  lastUsed: string
  permissions: ('read')[]
  status: 'active' | 'revoked'
  createdAt: string
}

interface ErrorCode {
  httpStatus: number
  code: string
  description: string
  solution: string
}

/* ═══════════════════════════════════════════════════════
   Code Block Component
═══════════════════════════════════════════════════════ */
function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const t = useTranslations('dashboard.apiDocs')

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      toast({ title: t('copyToastTitle'), description: t('copyToastDesc') })
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code, t])

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', margin: '8px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', background: '#0A0C14',
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{
          fontSize: 9, color: T.text4, fontFamily: "var(--font-mono)",
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
            fontFamily: "var(--font-ar)", fontWeight: 600,
            transition: 'color 0.2s',
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '14px 16px', background: '#07080E',
        overflowX: 'auto', direction: 'ltr', textAlign: 'left',
        fontFamily: "var(--font-mono)", fontSize: 11.5,
        lineHeight: 1.7, color: T.text2,
        maxHeight: 280,
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Endpoint Accordion Item
═══════════════════════════════════════════════════════ */
function EndpointItem({ endpoint, isOpen, onToggle }: { endpoint: Endpoint; isOpen: boolean; onToggle: () => void }) {
  const mc = METHOD_COLORS[endpoint.method]
  const t = useTranslations('dashboard.apiDocs')

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
          fontFamily: "var(--font-mono)",
          flexShrink: 0, letterSpacing: 0.5,
          minWidth: 52, textAlign: 'center',
        }}>
          {endpoint.method}
        </span>

        {/* Path */}
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: 600,
          color: isOpen ? T.text : T.text2,
          fontFamily: "var(--font-mono)",
          direction: 'ltr' as const, textAlign: 'left',
          transition: 'color 0.2s',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {endpoint.path}
        </span>

        {/* Description */}
        <span style={{
          flex: 2, fontSize: 11.5, color: T.text3,
          fontFamily: "var(--font-ar)",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {endpoint.description}
        </span>

        {/* Permission Badge */}
        <span style={{
          padding: '2px 8px', borderRadius: 6,
          background: endpoint.permission === 'none' ? `${T.text4}14` : `${T.green}14`,
          color: endpoint.permission === 'none' ? T.text4 : T.green,
          fontSize: 9, fontWeight: 700, fontFamily: "var(--font-ar)",
          border: `1px solid ${endpoint.permission === 'none' ? `${T.text4}25` : `${T.green}25`}`,
          flexShrink: 0,
        }}>
          {endpoint.permission === 'none' ? t('permPublic') : t('permRead')}
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
            fontFamily: "var(--font-ar)", marginBottom: 12,
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
                fontFamily: "var(--font-ar)",
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
              fontFamily: "var(--font-ar)",
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
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "var(--font-ar)" }}>
            {category.title}
          </div>
          <div style={{ fontSize: 10, color: T.text4, marginTop: 1, fontFamily: "var(--font-ar)" }}>
            {category.description}
          </div>
        </div>
        <span style={{
          fontSize: 9, padding: '3px 8px', borderRadius: 10,
          background: `${category.iconColor}10`, color: category.iconColor,
          fontFamily: "var(--font-mono)", fontWeight: 700,
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
  const t = useTranslations('dashboard.apiDocs')

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

  /* ── Data: Endpoint Categories ── */
  const ENDPOINT_CATEGORIES: EndpointCategory[] = [
    {
      id: 'auth',
      title: t('catAuthTitle'),
      icon: <Lock size={18} />,
      iconColor: T.purple,
      iconBg: `${T.purple}14`,
      description: t('catAuthDesc'),
      endpoints: [
        {
          method: 'POST',
          path: '/auth/otp/send',
          description: t('epAuthOtpSendDesc'),
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
          description: t('epAuthOtpVerifyDesc'),
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
                displayName: "Roua Trader",
                tier: "PRO"
              }
            }
          }, null, 2),
        },
        {
          method: 'GET',
          path: '/auth/me',
          description: t('epAuthMeDesc'),
          permission: 'read',
          requestBody: undefined,
          responseExample: JSON.stringify({
            success: true,
            data: {
              id: "usr_12345",
              displayName: "Roua Trader",
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
          description: t('epAuthRefreshDesc'),
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
      title: t('catMarketsTitle'),
      icon: <BarChart3 size={18} />,
      iconColor: T.cyan,
      iconBg: `${T.cyan}14`,
      description: t('catMarketsDesc'),
      endpoints: [
        {
          method: 'GET',
          path: '/exchange/quote/:symbol',
          description: t('epMarketsQuoteDesc'),
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
          description: t('epMarketsHistoryDesc'),
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
      title: t('catTradingTitle'),
      icon: <TrendingUp size={18} />,
      iconColor: T.green,
      iconBg: `${T.green}14`,
      description: t('catTradingDesc'),
      endpoints: [
        {
          method: 'POST',
          path: '/accounts/link',
          description: t('epTradingLinkDesc'),
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
          description: t('epTradingPositionsDesc'),
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
          description: t('epTradingUnlinkDesc'),
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
      title: t('catAiTitle'),
      icon: <Brain size={18} />,
      iconColor: T.purple,
      iconBg: `${T.purple}14`,
      description: t('catAiDesc'),
      endpoints: [
        {
          method: 'POST',
          path: '/ai/analyze',
          description: t('epAiAnalyzeDesc'),
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
                  summary: "Strong buy signal with positive momentum"
                },
                {
                  name: "groq",
                  recommendation: "buy",
                  confidence: 75,
                  summary: "Uptrend with RSI confirmation"
                }
              ],
              sentiment: { score: 0.65, label: "Positive" },
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
          description: t('epAiModelsDesc'),
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
          description: t('epAiChatDesc'),
          permission: 'read',
          requestBody: JSON.stringify({
            message: "What is the best time to enter a BTC long position?",
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
              message: "Based on the current technical analysis, BTC/USDT shows a corrective pattern at the 97000 level. I advise waiting for confirmation of a breakout above 98500 with high trading volume. The suggested stop loss is below 95200.",
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
      title: t('catSignalsTitle'),
      icon: <Radio size={18} />,
      iconColor: T.amber,
      iconBg: `${T.amber}14`,
      description: t('catSignalsDesc'),
      endpoints: [
        {
          method: 'POST',
          path: '/signals/generate/:pair',
          description: t('epSignalsGenerateDesc'),
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
              reasoning: "Resistance breakout with RSI confirmation and high volume",
              models: ["gemini", "groq", "glm4"],
              createdAt: "2026-03-04T14:30:00Z",
              expiresAt: "2026-03-05T02:30:00Z"
            }
          }, null, 2),
        },
        {
          method: 'GET',
          path: '/signals/active',
          description: t('epSignalsActiveDesc'),
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

  /* ── Data: API Keys ── */
  const INITIAL_API_KEYS: ApiKey[] = [
    {
      id: 'key_prod_001',
      name: 'Production Key',
      key: 'roua_live_sk_a1b2c3d4e5f6g7h8i9j0',
      lastUsed: t('lastUsed5Min'),
      permissions: ['read'],
      status: 'active',
      createdAt: '2025/11/15',
    },
    {
      id: 'key_dev_002',
      name: 'Development Key',
      key: 'roua_test_sk_z9y8x7w6v5u4t3s2r1q0',
      lastUsed: t('lastUsed3Hours'),
      permissions: ['read'],
      status: 'active',
      createdAt: '2026/01/08',
    },
  ]

  /* ── Data: Error Codes ── */
  const ERROR_CODES: ErrorCode[] = [
    { httpStatus: 400, code: 'BAD_REQUEST', description: t('errBadRequestDesc'), solution: t('errBadRequestSolution') },
    { httpStatus: 401, code: 'UNAUTHORIZED', description: t('errUnauthorizedDesc'), solution: t('errUnauthorizedSolution') },
    { httpStatus: 403, code: 'FORBIDDEN', description: t('errForbiddenDesc'), solution: t('errForbiddenSolution') },
    { httpStatus: 404, code: 'NOT_FOUND', description: t('errNotFoundDesc'), solution: t('errNotFoundSolution') },
    { httpStatus: 429, code: 'RATE_LIMITED', description: t('errRateLimitedDesc'), solution: t('errRateLimitedSolution') },
    { httpStatus: 500, code: 'INTERNAL_ERROR', description: t('errInternalErrorDesc'), solution: t('errInternalErrorSolution') },
    { httpStatus: 503, code: 'SERVICE_UNAVAILABLE', description: t('errServiceUnavailableDesc'), solution: t('errServiceUnavailableSolution') },
    { httpStatus: 400, code: 'INVALID_SYMBOL', description: t('errInvalidSymbolDesc'), solution: t('errInvalidSymbolSolution') },
    { httpStatus: 400, code: 'INVALID_API_KEY', description: t('errInvalidApiKeyDesc'), solution: t('errInvalidApiKeySolution') },
  ]

  /* ── Data: Webhook Events ── */
  const WEBHOOK_EVENTS = [
    { event: 'order.filled', description: t('whOrderFilled'), color: T.green },
    { event: 'order.partial', description: t('whOrderPartial'), color: T.cyan },
    { event: 'order.cancelled', description: t('whOrderCancelled'), color: T.red },
    { event: 'position.opened', description: t('whPositionOpened'), color: T.green },
    { event: 'position.closed', description: t('whPositionClosed'), color: T.amber },
    { event: 'signal.generated', description: t('whSignalGenerated'), color: T.purple },
    { event: 'price.alert', description: t('whPriceAlert'), color: T.cyan },
    { event: 'ai.analysis_complete', description: t('whAiAnalysisComplete'), color: T.purple },
    { event: 'account.connected', description: t('whAccountConnected'), color: T.green },
  ]

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
        lastUsed: t('lastUsedNever'),
        permissions: ['read'],
        status: 'active',
        createdAt: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
      }
      setApiKeys(prev => [...prev, newKey])
      setGenerating(false)
      toast({ title: t('keyGeneratedTitle'), description: t('keyGeneratedDesc') })
    }, 1200)
  }, [apiKeys.length, t])

  /* ── Revoke API Key ── */
  const handleRevokeKey = useCallback((keyId: string) => {
    setApiKeys(prev => prev.map(k => k.id === keyId ? { ...k, status: 'revoked' as const } : k))
    toast({ title: t('keyRevokedTitle'), description: t('keyRevokedDesc'), variant: 'destructive' })
  }, [t])

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
        direction: 'inherit',
        fontFamily: "var(--font-ar)",
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
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text, fontFamily: "var(--font-ar)", display: 'flex', alignItems: 'center', gap: 10 }}>
              {t('title')}
              <span style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 10,
                background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
                color: '#000', fontWeight: 800,
                fontFamily: "var(--font-mono)",
                boxShadow: `0 0 12px ${T.cyan}30`,
                letterSpacing: 0.5,
              }}>
                v1.0
              </span>
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: T.text3, fontFamily: "var(--font-ar)" }}>
              {t('subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      <div className="apidocs-content" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>

        {/* ═══ Quick Stats ═══ */}
        <div className="apidocs-quick-grid apidocs-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { icon: <Globe size={16} />, label: t('quickStatBaseUrl'), value: 'api.roua.io/v1', color: T.cyan, bg: `${T.cyan}14` },
            { icon: <Shield size={16} />, label: t('quickStatAuth'), value: 'Bearer Token', color: T.green, bg: `${T.green}14` },
            { icon: <Zap size={16} />, label: t('quickStatRateLimit'), value: t('rateLimitValue'), color: T.amber, bg: `${T.amber}14` },
            { icon: <Lock size={16} />, label: t('quickStatEncryption'), value: 'TLS 1.3', color: T.purple, bg: `${T.purple}14` },
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
                <div style={{ fontSize: 10, color: T.text4, fontFamily: "var(--font-ar)", marginBottom: 2 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "var(--font-mono)", direction: 'ltr', textAlign: 'left' }}>
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
            <h2 id="getting-started-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "var(--font-ar)" }}>
              {t('gettingStarted')}
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
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                  {t('baseUrlTitle')}
                </span>
              </div>
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: '#07080E', border: `1px solid ${T.border2}`,
                fontFamily: "var(--font-mono)", fontSize: 13,
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
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                  {t('authTitle')}
                </span>
              </div>
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: `${T.green}06`, border: `1px solid ${T.green}12`,
                fontSize: 11.5, color: T.text3, lineHeight: 1.8,
                fontFamily: "var(--font-ar)", marginBottom: 10,
              }}>
                {t('authDescription', { code: 'Authorization' })}
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
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                  {t('rateLimitsTitle')}
                </span>
              </div>
              <div className="apidocs-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { plan: t('planFree'), limit: '30', unit: t('requestsPerMinute'), color: T.text4 },
                  { plan: t('planPro'), limit: '100', unit: t('requestsPerMinute'), color: T.cyan },
                  { plan: t('planPremiumPlus'), limit: '500', unit: t('requestsPerMinute'), color: T.amber },
                ].map((r, i) => (
                  <div key={i} style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: T.surface, border: `1px solid ${T.border}`,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, color: T.text4, marginBottom: 4, fontFamily: "var(--font-ar)" }}>{r.plan}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: r.color, fontFamily: "var(--font-mono)" }}>{r.limit}</div>
                    <div style={{ fontSize: 9, color: T.text4, fontFamily: "var(--font-ar)" }}>{r.unit}</div>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 8,
                background: `${T.amber}06`, border: `1px solid ${T.amber}10`,
                fontSize: 10.5, color: T.text3, lineHeight: 1.7,
                fontFamily: "var(--font-ar)",
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertTriangle size={12} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
                {t('rateLimitWarning', { code: 'Retry-After' })}
              </div>
            </div>

            {/* Example curl Command */}
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Terminal size={14} color={T.purple} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                  {t('curlExampleTitle')}
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
            <h2 id="api-keys-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "var(--font-ar)" }}>
              {t('apiKeysTitle')}
            </h2>
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Generate Button */}
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>{t('yourApiKeys')}</div>
                <div style={{ fontSize: 11, color: T.text3, fontFamily: "var(--font-ar)" }}>
                  {t('yourApiKeysDesc')}
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
                  fontFamily: "var(--font-ar)", border: 'none', transition: 'all 0.2s',
                  boxShadow: `0 0 16px ${T.green}20`,
                  opacity: generating ? 0.7 : 1,
                }}
              >
                {generating ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
                {generating ? t('generating') : t('generateNewKey')}
              </button>
            </div>

            {/* Permission Legend */}
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { perm: 'read', label: t('permReadLabel'), color: T.green, desc: t('permReadDesc') },
                { perm: 'withdraw', label: t('permWithdraw'), color: T.red, desc: t('permWithdrawDesc'), disabled: true },
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
                    fontFamily: "var(--font-ar)",
                    textDecoration: p.disabled ? 'line-through' : 'none',
                  }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: 9, color: T.text4, fontFamily: "var(--font-ar)" }}>
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
                      <div style={{ fontSize: 13, fontWeight: 700, color: k.status === 'revoked' ? T.text4 : T.text, fontFamily: "var(--font-ar)", textDecoration: k.status === 'revoked' ? 'line-through' : 'none' }}>
                        {k.name}
                      </div>
                      <div style={{
                        fontSize: 10, color: T.text4,
                        fontFamily: "var(--font-mono)",
                        direction: 'ltr', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginTop: 2,
                      }}>
                        <span style={{ color: T.text4 }}>{visibleKeys.has(k.id) ? k.key : k.key.slice(0, 14) + '••••••••••••'}</span>
                        <button
                          onClick={() => toggleKeyVisibility(k.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text4, padding: 0, display: 'flex' }}
                          aria-label={visibleKeys.has(k.id) ? t('hideKey') : t('showKey')}
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
                            fontSize: 9, fontWeight: 700, fontFamily: "var(--font-ar)",
                          }}>
                            {p === 'read' ? t('permRead') : '—'}
                          </span>
                        ))}
                      </div>
                      {/* Last Used */}
                      <span style={{
                        fontSize: 9, color: T.text4, fontFamily: "var(--font-ar)",
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
                            fontFamily: "var(--font-ar)", cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${T.red}20`; e.currentTarget.style.borderColor = `${T.red}40` }}
                          onMouseLeave={e => { e.currentTarget.style.background = `${T.red}10`; e.currentTarget.style.borderColor = `${T.red}20` }}
                        >
                          <Trash2 size={10} />
                          {t('revoke')}
                        </button>
                      ) : (
                        <span style={{
                          fontSize: 9, padding: '3px 8px', borderRadius: 5,
                          background: `${T.red}14`, color: T.red, fontWeight: 700,
                          fontFamily: "var(--font-ar)",
                          border: `1px solid ${T.red}25`,
                        }}>
                          {t('revoked')}
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
              <h2 id="endpoints-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "var(--font-ar)" }}>
                {t('endpointsTitle')}
              </h2>
            </div>
            <span style={{
              fontSize: 10, color: T.text4,
              fontFamily: "var(--font-mono)",
              padding: '3px 10px', borderRadius: 10, background: T.surface,
              border: `1px solid ${T.border}`,
            }}>
              {t('endpointsCount', { count: ENDPOINT_CATEGORIES.reduce((s, c) => s + c.endpoints.length, 0) })}
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
            <h2 id="sdks-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "var(--font-ar)" }}>
              {t('sdksTitle')}
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
                    fontFamily: "var(--font-ar)",
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
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 6, fontFamily: "var(--font-ar)" }}>
                {t('install')}
              </div>
              <CodeBlock
                language="bash"
                code={activeTab === 'js' ? 'npm install @roua/sdk' : 'pip install roua-sdk'}
              />
            </div>

            {/* Code Snippet */}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 6, fontFamily: "var(--font-ar)" }}>
                {t('fullExample')}
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
            <h2 id="webhooks-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "var(--font-ar)" }}>
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
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)" }}>
                  {t('webhooksSetup')}
                </span>
              </div>
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: `${T.cyan}06`, border: `1px solid ${T.cyan}12`,
                fontSize: 11.5, color: T.text3, lineHeight: 1.8,
                fontFamily: "var(--font-ar)", marginBottom: 12,
              }}>
                {t('webhooksDescription')}
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
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)", marginBottom: 10 }}>
                {t('eventTypes')}
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
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700, direction: 'ltr',
                    }}>
                      {ev.event}
                    </span>
                    <span style={{ fontSize: 10, color: T.text3, fontFamily: "var(--font-ar)" }}>
                      {ev.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payload Example */}
            <div style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "var(--font-ar)", marginBottom: 8 }}>
                {t('payloadExample')}
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
                fontFamily: "var(--font-ar)",
                display: 'flex', alignItems: 'flex-start', gap: 6,
              }}>
                <Shield size={11} color={T.green} style={{ flexShrink: 0, marginTop: 2 }} />
                {t('signatureVerification', { code: 'signature' })}
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
            <h2 id="errors-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, fontFamily: "var(--font-ar)" }}>
              {t('errorCodesTitle')}
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
              fontFamily: "var(--font-ar)",
            }}>
              <span>{t('colStatus')}</span>
              <span>{t('colCode')}</span>
              <span>{t('colDescription')}</span>
              <span>{t('colSolution')}</span>
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
                  fontFamily: "var(--font-mono)", fontWeight: 800,
                  color: err.httpStatus >= 500 ? T.red :
                         err.httpStatus >= 400 ? T.amber : T.green,
                  fontSize: 12,
                }}>
                  {err.httpStatus}
                </span>
                {/* Error Code */}
                <span style={{
                  fontFamily: "var(--font-mono)",
                  color: T.cyan, fontSize: 10, fontWeight: 600,
                  direction: 'ltr',
                }}>
                  {err.code}
                </span>
                {/* Description */}
                <span style={{
                  color: T.text2, fontFamily: "var(--font-ar)",
                  lineHeight: 1.5,
                }}>
                  {err.description}
                </span>
                {/* Solution */}
                <span style={{
                  color: T.text4, fontFamily: "var(--font-ar)",
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
          <div style={{ fontSize: 11, color: T.text4, fontFamily: "var(--font-ar)", lineHeight: 1.8 }}>
            {t('footerNote')}
          </div>
          <div style={{ fontSize: 10, color: T.text4, fontFamily: "var(--font-ar)", marginTop: 4 }}>
            {t('needHelp')}{' '}
            <span style={{ color: T.cyan, cursor: 'pointer', fontWeight: 700 }}>{t('contactSupport')}</span>
            {' '}{t('or')}{' '}
            <span style={{ color: T.cyan, cursor: 'pointer', fontWeight: 700 }}>{t('visitHelpCenter')}</span>
          </div>
        </div>
      </div>

      {/* Spin animation for loading */}
      {/* Scoped styles via useScopedStyle */}</div>
  )
}
