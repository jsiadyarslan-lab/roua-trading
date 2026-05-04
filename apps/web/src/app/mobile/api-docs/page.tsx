'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Code, ChevronDown, Copy, Check, Key, Shield, Zap,
  Lock, Eye, EyeOff, Trash2, Plus, Send, FileJson, Info,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#32D74B', danger: '#FF453A', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.25)', text4: '#475569', border: 'rgba(255,255,255,0.08)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: `${C.success}14`, text: C.success, border: `${C.success}30` },
  POST: { bg: `${C.accent}14`, text: C.accent, border: `${C.accent}30` },
  DELETE: { bg: `${C.danger}14`, text: C.danger, border: `${C.danger}30` },
  PUT: { bg: `${C.amber}14`, text: C.amber, border: `${C.amber}30` },
  PATCH: { bg: `${C.purple}14`, text: C.purple, border: `${C.purple}30` },
}

interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'; path: string; description: string;
  permission: string; requestBody?: string; responseExample: string;
}

interface EndpointCategory {
  id: string; title: string; icon: React.ReactNode; iconColor: string; description: string; endpoints: Endpoint[];
}

const ENDPOINT_CATEGORIES: EndpointCategory[] = [
  {
    id: 'auth', title: 'المصادقة', icon: <Lock size={16} />, iconColor: C.purple,
    description: 'إدارة المصادقة والجلسات',
    endpoints: [
      { method: 'POST', path: '/auth/otp/send', description: 'إرسال رمز التحقق OTP', permission: 'none', responseExample: '{ "success": true }' },
      { method: 'POST', path: '/auth/otp/verify', description: 'التحقق من رمز OTP', permission: 'none', responseExample: '{ "success": true, "data": { "accessToken": "..." } }' },
      { method: 'GET', path: '/auth/me', description: 'استرجاع بيانات المستخدم الحالي', permission: 'read', responseExample: '{ "success": true, "data": { "id": "usr_123" } }' },
      { method: 'POST', path: '/auth/refresh', description: 'تجديد جلسة المستخدم', permission: 'none', responseExample: '{ "success": true }' },
    ],
  },
  {
    id: 'markets', title: 'الأسواق', icon: <Zap size={16} />, iconColor: C.accent,
    description: 'بيانات الأسواق المباشرة والتاريخية',
    endpoints: [
      { method: 'GET', path: '/exchange/quote/:symbol', description: 'السعر المباشر لزوج تداول', permission: 'read', responseExample: '{ "success": true, "data": { "symbol": "BTC/USDT", "price": 97542.50 } }' },
      { method: 'GET', path: '/exchange/history/:symbol', description: 'بيانات تاريخية (شموع)', permission: 'read', responseExample: '{ "success": true, "data": { "candles": [] } }' },
    ],
  },
  {
    id: 'ai', title: 'الذكاء الاصطناعي', icon: <Code size={16} />, iconColor: C.purple,
    description: 'تحليلات ذكية ونماذج AI',
    endpoints: [
      { method: 'POST', path: '/ai/analyze', description: 'تحليل ذكي شامل لأصل مالي', permission: 'read', responseExample: '{ "success": true, "data": { "consensus": "bullish" } }' },
      { method: 'GET', path: '/ai/models', description: 'قائمة نماذج الذكاء الاصطناعي', permission: 'read', responseExample: '{ "success": true, "data": { "models": [] } }' },
      { method: 'POST', path: '/ai/chat', description: 'محادثة مع مساعد AI', permission: 'read', responseExample: '{ "success": true, "data": { "message": "..." } }' },
    ],
  },
]

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true); toast({ title: 'تم النسخ' }); setTimeout(() => setCopied(false), 2000)
    })
  }, [code])

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px', background: '#0A0C14', borderBottom: `0.5px solid ${C.border}` }}>
        <span style={{ fontSize: 8, color: C.text4, fontFamily: FONT_MONO, textTransform: 'uppercase' }}>{language}</span>
        <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? C.success : C.text4, display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontFamily: FONT_AR }}>
          {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '10px 12px', background: '#07080E', overflowX: 'auto', direction: 'ltr', textAlign: 'left', fontFamily: FONT_MONO, fontSize: 10, lineHeight: 1.6, color: C.text2, maxHeight: 200 }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export default function MobileApiDocsPage() {
  const router = useRouter()
  const [openEndpoints, setOpenEndpoints] = useState<Set<string>>(new Set())
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['auth']))
  const [activeTab, setActiveTab] = useState<'endpoints' | 'keys' | 'sdk'>('endpoints')
  const [apiKeys, setApiKeys] = useState([
    { id: 'key1', name: 'Production Key', key: 'roua_live_sk_a1b2c3...', status: 'active', lastUsed: 'منذ 5 دقائق' },
    { id: 'key2', name: 'Development Key', key: 'roua_test_sk_z9y8x7...', status: 'active', lastUsed: 'منذ 3 ساعات' },
  ])
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)

  const toggleEndpoint = (id: string) => { setOpenEndpoints(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleCategory = (id: string) => { setOpenCategories(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  const handleGenerateKey = () => {
    setGenerating(true)
    setTimeout(() => {
      setApiKeys(prev => [...prev, { id: `key_${Date.now()}`, name: `New Key ${prev.length + 1}`, key: `roua_test_sk_${Math.random().toString(36).slice(2, 18)}...`, status: 'active', lastUsed: 'لم يُستخدم بعد' }])
      setGenerating(false)
      toast({ title: 'تم إنشاء مفتاح جديد' })
    }, 1000)
  }

  const toggleKeyVisibility = (keyId: string) => { setVisibleKeys(prev => { const n = new Set(prev); n.has(keyId) ? n.delete(keyId) : n.add(keyId); return n }) }

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 12px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
            width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #00D4FF, #0A84FF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Code size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>توثيق API</h1>
              <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>المرجع الشامل لواجهة برمجة رؤى</p>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ id: 'endpoints', label: 'النقاط' }, { id: 'keys', label: 'المفاتيح' }, { id: 'sdk', label: 'SDK' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
              background: activeTab === tab.id ? `${C.accent}15` : 'transparent',
              color: activeTab === tab.id ? C.accent : C.text2,
              fontSize: 11, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Endpoints Tab */}
        {activeTab === 'endpoints' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ENDPOINT_CATEGORIES.map(cat => (
              <div key={cat.id} style={{ borderRadius: 16, background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)', border: `0.5px solid ${C.border}`, overflow: 'hidden' }}>
                {/* Category Header */}
                <button onClick={() => toggleCategory(cat.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right',
                  borderBottom: openCategories.has(cat.id) ? `0.5px solid ${C.border}` : 'none',
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `${cat.iconColor}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.iconColor, flexShrink: 0 }}>{cat.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>{cat.title}</div>
                    <div style={{ fontSize: 9, color: C.text4, fontFamily: FONT_AR }}>{cat.description}</div>
                  </div>
                  <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 8, background: `${cat.iconColor}10`, color: cat.iconColor, fontFamily: FONT_MONO, fontWeight: 700 }}>{cat.endpoints.length}</span>
                  <ChevronDown size={14} color={C.text4} style={{ transition: 'transform 0.3s', transform: openCategories.has(cat.id) ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>

                {/* Endpoints */}
                <AnimatePresence>
                  {openCategories.has(cat.id) && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 16px' }}>
                        {cat.endpoints.map(ep => {
                          const isOpen = openEndpoints.has(`${cat.id}-${ep.path}`)
                          const mc = METHOD_COLORS[ep.method]
                          return (
                            <div key={`${cat.id}-${ep.path}`} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                              <button onClick={() => toggleEndpoint(`${cat.id}-${ep.path}`)} style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
                              }}>
                                <span style={{ padding: '2px 8px', borderRadius: 5, background: mc.bg, color: mc.text, border: `0.5px solid ${mc.border}`, fontSize: 9, fontWeight: 800, fontFamily: FONT_MONO, flexShrink: 0, minWidth: 42, textAlign: 'center' }}>{ep.method}</span>
                                <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: isOpen ? C.text : C.text2, fontFamily: FONT_MONO, direction: 'ltr', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.path}</span>
                                <ChevronDown size={11} color={C.text4} style={{ transition: 'transform 0.3s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }} />
                              </button>
                              <AnimatePresence>
                                {isOpen && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', paddingBottom: 12 }}>
                                    <div style={{ fontSize: 10, color: C.text3, fontFamily: FONT_AR, marginBottom: 6, padding: '6px 8px', borderRadius: 6, background: `${C.accent}04`, border: `0.5px solid ${C.accent}08` }}>
                                      <Info size={10} color={C.accent} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />{ep.description}
                                    </div>
                                    {ep.requestBody && (
                                      <div style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <Send size={9} color={C.accent} /> Request Body
                                        </div>
                                        <CodeBlock code={ep.requestBody} />
                                      </div>
                                    )}
                                    <div>
                                      <div style={{ fontSize: 9, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <FileJson size={9} color={C.success} /> Response
                                      </div>
                                      <CodeBlock code={ep.responseExample} />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}

        {/* Keys Tab */}
        {activeTab === 'keys' && (
          <div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleGenerateKey} disabled={generating} style={{
              width: '100%', padding: '12px', borderRadius: 14, border: 'none',
              background: `linear-gradient(135deg, ${C.accent}, #0A84FF)`, color: '#000',
              fontSize: 13, fontWeight: 800, fontFamily: FONT_AR, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12,
            }}>
              {generating ? <div style={{ width: 14, height: 14, border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <Plus size={16} />}
              إنشاء مفتاح جديد
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </motion.button>

            {apiKeys.map(key => (
              <div key={key.id} style={{ padding: '14px', borderRadius: 14, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Key size={14} color={C.amber} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>{key.name}</span>
                  </div>
                  <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 8, background: key.status === 'active' ? `${C.success}15` : `${C.danger}15`, color: key.status === 'active' ? C.success : C.danger, fontWeight: 700, fontFamily: FONT_AR }}>
                    {key.status === 'active' ? 'نشط' : 'ملغى'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 10, fontFamily: FONT_MONO, color: C.text2, direction: 'ltr', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {visibleKeys.has(key.id) ? key.key : '••••••••••••••••'}
                  </span>
                  <button onClick={() => toggleKeyVisibility(key.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3 }}>
                    {visibleKeys.has(key.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(key.key); toast({ title: 'تم النسخ' }) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3 }}>
                    <Copy size={12} />
                  </button>
                </div>
                <div style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR }}>آخر استخدام: {key.lastUsed}</div>
              </div>
            ))}

            {/* Security Note */}
            <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(0,255,163,0.04)', border: '0.5px solid rgba(0,255,163,0.1)', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Shield size={12} color={C.success} />
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>مبدأ Non-Custodial</span>
              </div>
              <p style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR, lineHeight: 1.5 }}>رؤى لا تلمس أموالك أبداً. المفاتيح مشفرة بـ AES-256-GCM وتُستخدم فقط للقراءة.</p>
            </div>
          </div>
        )}

        {/* SDK Tab */}
        {activeTab === 'sdk' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 8 }}>JavaScript / TypeScript SDK</div>
            <CodeBlock code={`import { RouaClient } from '@roua/sdk';

const roua = new RouaClient({
  apiKey: 'roua_live_sk_your_key_here',
  baseURL: 'https://api.roua.io/v1'
});

// Get live quote
const quote = await roua.markets.getQuote('BTC/USDT');

// Get AI analysis
const analysis = await roua.ai.analyze({
  symbol: 'BTC/USDT',
  timeframe: '4h',
});`} language="javascript" />

            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR, margin: '16px 0 8px' }}>Python SDK</div>
            <CodeBlock code={`from roua import RouaClient

client = RouaClient(
    api_key="roua_live_sk_your_key_here",
    base_url="https://api.roua.io/v1"
)

quote = client.markets.get_quote("BTC/USDT")
analysis = client.ai.analyze(
    symbol="BTC/USDT",
    timeframe="4h",
)`} language="python" />

            {/* Quick Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              {[
                { icon: <Zap size={14} />, label: 'الحد الأقصى', value: '100 طلب/دقيقة', color: C.amber },
                { icon: <Shield size={14} />, label: 'المصادقة', value: 'Bearer Token', color: C.success },
              ].map((s, i) => (
                <div key={i} style={{ padding: '12px', borderRadius: 12, background: 'rgba(28,28,30,0.6)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ color: s.color, display: 'flex' }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 8, color: C.text3, fontFamily: FONT_AR }}>{s.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
