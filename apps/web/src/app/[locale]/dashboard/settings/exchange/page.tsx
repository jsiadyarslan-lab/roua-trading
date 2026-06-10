'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from '@/i18n/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  Key,
  Plus,
  Trash2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Link2,
  Globe,
  Copy,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAgentStore } from '@/hooks/useAgentStore'
import SubPageLayout from '@/components/dashboard/SubPageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Credential {
  id: string
  exchange: string
  label: string
  permissions: string
  isValid: boolean
  lastValidatedAt: string | null
  createdAt: string
  testnet?: boolean
}

const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance', icon: '🔶' },
  { id: 'binance_test', name: 'Binance Spot Testnet', icon: '🧪' },
  { id: 'binance_future_test', name: 'Binance Futures Testnet', icon: '📈' },
  { id: 'kucoin', name: 'KuCoin', icon: '🟢', requiresPassphrase: true }, // V170 FIX: KuCoin requires passphrase
  { id: 'bybit', name: 'Bybit', icon: '🟠' },
  { id: 'okx', name: 'OKX', icon: '⚪', requiresPassphrase: true },
  { id: 'gateio', name: 'Gate.io', icon: '🔵' },
  { id: 'mt5', name: 'MetaTrader 5', icon: '📊', isMT5: true },
  { id: 'mt5_demo', name: 'MT5 Demo', icon: '📋', isMT5: true },
]

export default function ExchangeSettingsPage() {
  const tn = useTranslations('notifications.exchange')
  const router = useRouter()
  const { loading: authLoading, isGuest } = useAuth()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [activeCredentialId, setActiveCredentialId] = useState<string>('')
  const [activeSaving, setActiveSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // V165: Server IP for Binance IP whitelist
  const [serverIp, setServerIp] = useState<string | null>(null)
  const [ipLoading, setIpLoading] = useState(false)

  // V172: Leverage settings for testnet/paper accounts
  const { settings: agentSettings, updateSettings, fetchSettings } = useAgentStore()
  const [leverageSaving, setLeverageSaving] = useState(false)
  const [leverageSaved, setLeverageSaved] = useState(false)
  const [leverageOpen, setLeverageOpen] = useState(true)
  const [cryptoLev, setCryptoLev] = useState(1)
  const [forexLev, setForexLev] = useState(50)
  const [goldLev, setGoldLev] = useState(20)

  // Load leverage from agentSettings when available
  useEffect(() => {
    if (agentSettings) {
      setCryptoLev(agentSettings.paperCryptoLeverage ?? 1)
      setForexLev(agentSettings.paperForexLeverage ?? 50)
      setGoldLev(agentSettings.paperGoldLeverage ?? 20)
    }
  }, [agentSettings])

  const hasTestAccount = credentials.some(c =>
    c.exchange === 'paper-trading' || c.exchange?.includes('test') || c.exchange === 'mt5_demo'
  )

  const handleSaveLeverage = async () => {
    setLeverageSaving(true)
    await updateSettings({
      paperCryptoLeverage: cryptoLev,
      paperForexLeverage: forexLev,
      paperGoldLeverage: goldLev,
    })
    setLeverageSaving(false)
    setLeverageSaved(true)
    setTimeout(() => setLeverageSaved(false), 3000)
  }
  const [ipCopied, setIpCopied] = useState(false)

  // Form state
  const [exchange, setExchange] = useState('binance')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [testnet, setTestnet] = useState(false)
  // V165: Key type selection (HMAC vs Ed25519/RSA)
  const [keyType, setKeyType] = useState<'hmac' | 'ed25519' | 'rsa'>('hmac')

  const isBinance = exchange.toLowerCase().startsWith('binance') && !exchange.includes('test')
  const isMT5 = exchange === 'mt5' || exchange === 'mt5_demo'
  const isMT5Demo = exchange === 'mt5_demo'

  // Fetch server IP for Binance IP whitelist
  const fetchServerIp = useCallback(async () => {
    setIpLoading(true)
    try {
      const res = await fetch('/api/portfolio/credentials/server-ip')
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.serverIp) {
          setServerIp(data.data.serverIp)
        }
      }
    } catch {
      // Silently fail
    } finally {
      setIpLoading(false)
    }
  }, [])

  // Fetch credentials
  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/credentials')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setCredentials(data.data)
        }
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false)
    }
  }, [])

  // V174: Load activeCredentialId from user settings on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data?.settings?.activeCredentialId) {
          setActiveCredentialId(data.settings.activeCredentialId)
        }
      })
      .catch(() => { /* non-critical */ })
  }, [])

  useEffect(() => {
    fetchCredentials()
    fetchServerIp()
    fetchSettings()
  }, [fetchCredentials, fetchServerIp, fetchSettings])

  // Copy server IP to clipboard
  const copyServerIp = () => {
    if (serverIp) {
      navigator.clipboard.writeText(serverIp)
      setIpCopied(true)
      setTimeout(() => setIpCopied(false), 2000)
    }
  }

  // Submit new credential
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/portfolio/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, label: label || `${exchange}-key`, apiKey, apiSecret, passphrase: passphrase || undefined, testnet, keyType }),
      })

      if (!res.ok) {
        const data = await res.json()
        const errorMsg = data.error || data.message || tn('addKeyFailed')
        throw new Error(errorMsg)
      }

      setSuccess(tn('addKeySuccess'))
      setLabel('')
      setApiKey('')
      setApiSecret('')
      setPassphrase('')
      setTestnet(false)
      setKeyType('hmac')
      setShowForm(false)
      fetchCredentials()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle testnet mode
  const handleSetActive = async (credentialId: string) => {
    setActiveSaving(true)
    setActiveCredentialId(credentialId)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { activeCredentialId: credentialId } }),
      })
      if (!res.ok) {
        // Retry once
        await new Promise(r => setTimeout(r, 500))
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: { activeCredentialId: credentialId } }),
        })
      }
    } catch { /* non-critical */ }
    setActiveSaving(false)
  }

  const handleToggleTestnet = async (id: string, currentTestnet: boolean) => {
    const action = currentTestnet ? 'إلغاء وضع التجريب' : 'تفعيل وضع التجريب'
    if (!confirm(`هل أنت متأكد من ${action}؟ سيتم تغيير اتصال API key بين Testnet و Mainnet.`)) return

    try {
      const res = await fetch(`/api/portfolio/credentials/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testnet: !currentTestnet })
      })
      if (res.ok) {
        setCredentials(prev => prev.map(c => 
          c.id === id ? { ...c, testnet: !currentTestnet } : c
        ))
      }
    } catch {
      // Error handled silently
    }
  }

  // Delete credential
  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المفتاح؟ هذا الإجراء لا يمكن التراجع عنه.')) return

    try {
      const res = await fetch(`/api/portfolio/credentials/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCredentials(prev => prev.filter(c => c.id !== id))
      }
    } catch {
      // Error handled silently
    }
  }

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--accent)' }} />
      </div>
    )
  }

  if (isGuest) {
    return (
      <SubPageLayout
        title="مفاتيح البورصات"
        icon={<Key size={14} color="#fff" />}
        iconBg="linear-gradient(135deg, #FFB800, #FF8C00)"
      >
        <div className="p-4 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-300 text-sm mb-2">
                ربط Binance غير متاح في وضع الزائر
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                يجب تسجيل الدخول بحساب حقيقي قبل إضافة مفاتيح البورصة حتى يبقى الرصيد معزولا لكل مستخدم.
              </p>
              <Button onClick={() => router.push('/login')} size="sm">
                تسجيل الدخول
              </Button>
            </div>
          </div>
        </div>
      </SubPageLayout>
    )
  }

  return (
    <SubPageLayout
      title="مفاتيح البورصات"
      icon={<Key size={14} color="#fff" />}
      iconBg="linear-gradient(135deg, #FFB800, #FF8C00)"
      actions={
        <button onClick={() => setShowForm(!showForm)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-ar)', cursor: 'pointer', boxShadow: 'var(--glow-accent)' }}>
          <Plus size={12} /> إضافة مفتاح
        </button>
      }
    >

        {/* ═══════════════════════════════════════════════════════════════
            V165: Binance IP Whitelist Banner — the KEY fix for the shared
            balance bug. Without adding the server IP to Binance IP whitelist,
            all authenticated Binance API calls fail from Railway, causing
            fallback to paper trading balance (which is the same for all users).
            ═══════════════════════════════════════════════════════════════ */}
        {isBinance && serverIp && (
          <div className="p-4 rounded-lg bg-amber-500/8 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-amber-300 text-sm mb-2">
                  خطوة مطلوبة: إضافة عنوان IP للخادم إلى القائمة البيضاء في Binance
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  بدون هذه الخطوة، سيرفض Binance طلبات API من خادمنا، وسيتم عرض رصيد التداول الورقي بدلاً من رصيدك الحقيقي.
                  هذا هو <span className="text-amber-300 font-medium">سبب ظهور نفس الرصيد لجميع المستخدمين</span>.
                </p>
                <div className="flex items-center gap-2 p-2.5 rounded-md bg-black/30 border border-amber-500/10">
                  <span className="text-xs text-muted-foreground">عنوان IP للخادم:</span>
                  <code className="text-sm font-mono text-amber-300 font-bold">{serverIp}</code>
                  <button
                    onClick={copyServerIp}
                    className="p-1 rounded hover:bg-amber-500/10 transition-colors"
                    title="نسخ"
                  >
                    {ipCopied ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </button>
                </div>

                {/* V166: Key-type-aware IP restriction instructions */}
                {keyType === 'hmac' ? (
                  <>
                    <ol className="mt-3 text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                      <li>اذهب إلى <span className="text-foreground font-medium" dir="ltr">Binance → API Management</span></li>
                      <li>اضغط <span className="text-foreground font-medium">Edit</span> بجانب مفتاح API الخاص بك</li>
                      <li>في قسم <span className="text-foreground font-medium" dir="ltr">IP Access Restrictions</span></li>
                      <li>اختر <span className="text-foreground font-medium">Restrict access to trusted IPs only</span></li>
                      <li>أضف عنوان IP: <code className="text-amber-300 font-mono font-bold">{serverIp}</code></li>
                      <li>احفظ التغييرات ✅</li>
                    </ol>
                    <p className="mt-2 text-xs text-muted-foreground">
                      💡 <span className="text-foreground">ملاحظة:</span> مفاتيح HMAC بدون IP Restriction لن تملك إلا صلاحية القراءة فقط. يمكنك أيضاً اختيار "Unrestricted" لكن Binance ستنهي صلاحية المفتاح كل 90 يوم.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mt-3 p-2.5 rounded-md bg-blue-500/8 border border-blue-500/15">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        مفاتيح {keyType === 'ed25519' ? 'Ed25519' : 'RSA'} هي مفاتيح <span className="text-blue-300 font-medium">Self-generated</span> — لا تحتاج إلى IP Access Restrictions لأنها أكثر أماناً بشكل افتراضي.
                        Binance يتيح لك صلاحيات كاملة بدون قيود IP عند استخدام هذا النوع من المفاتيح.
                      </p>
                    </div>
                    <ol className="mt-3 text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                      <li>اذهب إلى <span className="text-foreground font-medium" dir="ltr">Binance → API Management</span></li>
                      <li>اضغط <span className="text-foreground font-medium">Edit</span> بجانب مفتاح API الخاص بك</li>
                      <li>تأكد أن صلاحيات <span className="text-foreground font-medium" dir="ltr">Spot & Margin Trading</span> و <span className="text-foreground font-medium" dir="ltr">User Data</span> مفعّلة ✅</li>
                      <li>لا حاجة لإضافة IP Restriction — مفتاحك آمن بدونها</li>
                    </ol>
                    <p className="mt-2 text-xs text-amber-300">
                      ⚠️ <span className="text-foreground">مهم:</span> تأكد أنك لصقت <span className="font-medium">المفتاح الخاص كاملاً</span> (بما في ذلك أسطر BEGIN/END) في حقل "المفتاح الخاص" أدناه.
                      المفتاح الخاص ≠ المفتاح العام. المفتاح العام رفعته إلى Binance، أما الخاص فنحتاجه هنا للتوقيع.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-teal-500/5 border border-teal-500/10">
          <Shield className="w-5 h-5 text-teal-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground mb-1">مبدأ Non-Custodial</p>
            <p>
              رؤى لا تلمس أموالك أبداً. مفاتيح API مشفرة بـ AES-256-GCM وتُستخدم فقط للقراءة ومتابعة حساباتك.
              <span className="text-red-400 font-medium"> المفاتيح التي تحتوي على صلاحيات سحب (Withdraw) أو تحويل (Transfer) تُرفض فوراً.</span>
            </p>
          </div>
        </div>

        {/* Add Credential Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    إضافة مفتاح API جديد
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Exchange Selection */}
                    <div className="space-y-2">
                      <Label>البورصة</Label>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {SUPPORTED_EXCHANGES.map((ex) => (
                          <button
                            key={ex.id}
                            type="button"
                            onClick={() => setExchange(ex.id)}
                            className={`p-3 rounded-xl text-center text-sm transition-all ${
                              exchange === ex.id
                                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 font-medium border'
                                : 'bg-background border border-border hover:border-teal-500/20'
                            }`}
                          >
                            <span className="block text-xl mb-1">{ex.icon}</span>
                            {ex.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* V165: Key Type Selection for Binance */}
                    {isBinance && (
                      <div className="space-y-2">
                        <Label>نوع المفتاح</Label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setKeyType('hmac')}
                            className={`p-3 rounded-xl text-center text-xs transition-all ${
                              keyType === 'hmac'
                                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 font-medium border'
                                : 'bg-background border border-border hover:border-teal-500/20'
                            }`}
                          >
                            <span className="block text-lg mb-1">🔑</span>
                            HMAC-SHA256
                            <span className="block text-[10px] text-muted-foreground mt-0.5">المفتاح السري</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setKeyType('ed25519')}
                            className={`p-3 rounded-xl text-center text-xs transition-all ${
                              keyType === 'ed25519'
                                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 font-medium border'
                                : 'bg-background border border-border hover:border-teal-500/20'
                            }`}
                          >
                            <span className="block text-lg mb-1">🔐</span>
                            Ed25519
                            <span className="block text-[10px] text-muted-foreground mt-0.5">مُوصى به</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setKeyType('rsa')}
                            className={`p-3 rounded-xl text-center text-xs transition-all ${
                              keyType === 'rsa'
                                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 font-medium border'
                                : 'bg-background border border-border hover:border-teal-500/20'
                            }`}
                          >
                            <span className="block text-lg mb-1">🛡️</span>
                            RSA
                            <span className="block text-[10px] text-muted-foreground mt-0.5">2048/4096 بت</span>
                          </button>
                        </div>
                        {keyType !== 'hmac' && (
                          <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/10">
                            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              مفاتيح {keyType === 'ed25519' ? 'Ed25519' : 'RSA'} هي <span className="text-blue-300 font-medium">تشفير غير متماثل</span>: 
                              أنت ترفع المفتاح العام (Public Key) إلى Binance، وتستخدم المفتاح الخاص (Private Key) هنا.
                              {keyType === 'ed25519' && ' Binance توصي بـ Ed25519 لأنه الأسرع والأكثر أماناً.'}
                              ضع محتوى المفتاح الخاص في حقل "API Secret" أدناه.
                            </p>
                          </div>
                        )}
                        {keyType === 'hmac' && (
                          <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/10">
                            <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              مفاتيح HMAC-SHA256 هي النوع التقليدي. Binance تعتبرها <span className="text-amber-300 font-medium">مهملة (Deprecated)</span> وتنصح بالانتقال لـ Ed25519.
                              لكنها لا تزال تعمل بشكل كامل.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Label */}
                    <div className="space-y-2">
                      <Label htmlFor="label">تسمية المفتاح (اختياري)</Label>
                      <Input
                        id="label"
                        placeholder={`مثال: ${exchange}-main`}
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        dir="ltr"
                        className="bg-background"
                      />
                    </div>

                    {/* MT5: Account Number */}
                    {isMT5 ? (
                      <>
                        {/* MT5 Info Banner */}
                        <div className="flex items-start gap-2 p-2.5 rounded-md bg-purple-500/5 border border-purple-500/10">
                          <Info className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            ربط حساب MetaTrader 5 يتطلب حساباً على <span className="text-purple-300 font-medium">MetaAPI Cloud</span>.
                            الحسابات التجريبية (Demo) تُنفذ <span className="text-purple-300 font-medium">جميع فحوصات المخاطر</span> كاملةً —
                            تماماً كالحساب الحقيقي. الفرق الوحيد هو نوع الأموال (افتراضية مقابل حقيقية).
                          </p>
                        </div>

                        {/* MT5 Account Number */}
                        <div className="space-y-2">
                          <Label htmlFor="apiKey">رقم حساب MT5</Label>
                          <Input
                            id="apiKey"
                            type="text"
                            placeholder="مثال: 12345678"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            dir="ltr"
                            className="bg-background"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            رقم حساب التداول الخاص بك في MetaTrader 5 (Login ID)
                          </p>
                        </div>

                        {/* MT5 Password */}
                        <div className="space-y-2">
                          <Label htmlFor="apiSecret">كلمة سر الحساب</Label>
                          <Input
                            id="apiSecret"
                            type="password"
                            placeholder="كلمة سر حساب MT5"
                            value={apiSecret}
                            onChange={(e) => setApiSecret(e.target.value)}
                            dir="ltr"
                            className="bg-background"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            كلمة السر التي تستخدمها لتسجيل الدخول إلى MetaTrader 5
                          </p>
                        </div>

                        {/* MT5 Server Name */}
                        <div className="space-y-2">
                          <Label htmlFor="passphrase">اسم السيرفر</Label>
                          <Input
                            id="passphrase"
                            type="text"
                            placeholder="مثال: MetaQuotes-Demo أو XMGlobal-Server"
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            dir="ltr"
                            className="bg-background"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            اسم السيرفر الذي يظهر في نافذة تسجيل الدخول في MT5
                          </p>
                        </div>
                      </>
                    ) : (
                    <>
                    {/* Non-MT5: API Key */}
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">API Key</Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder={keyType !== 'hmac' && isBinance ? 'أدخل مفتاح API من Binance' : 'أدخل مفتاح API'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        dir="ltr"
                        className="bg-background"
                        required
                      />
                    </div>

                    {/* Non-MT5: API Secret / Private Key */}
                    <div className="space-y-2">
                      <Label htmlFor="apiSecret">
                        {keyType !== 'hmac' && isBinance ? 'المفتاح الخاص (Private Key)' : 'API Secret'}
                      </Label>
                      <Input
                        id="apiSecret"
                        type="password"
                        placeholder={
                          keyType !== 'hmac' && isBinance
                            ? 'الصق محتوى المفتاح الخاص هنا (-----BEGIN PRIVATE KEY-----...)'
                            : 'أدخل المفتاح السري'
                        }
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        dir="ltr"
                        className="bg-background"
                        required
                      />
                      {keyType !== 'hmac' && isBinance && (
                        <p className="text-xs text-muted-foreground">
                          الصق محتوى ملف المفتاح الخاص بالكامل، بما في ذلك أسطر BEGIN/END
                        </p>
                      )}
                    </div>
                    </>
                    )}

                    {/* MT5 Demo Account Notice */}
                    {isMT5Demo && (
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/10">
                        <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          حساب MT5 Demo يُعامل <span className="text-amber-300 font-medium">كحساب تجريبي حقيقي</span> —
                          جميع فحوصات المخاطر (حد المركز، وقف الخسارة، السحب اليومي) تُنفّذ بالكامل.
                          هذا يضمن أن تجربتك على الحساب التجريبي تعكس سلوك الحساب الحقيقي بدقة.
                        </p>
                      </div>
                    )}

                    {/* Testnet Mode (for Binance and other exchanges that support it) */}
                    {(exchange === 'binance' || exchange === 'binance_test' || exchange === 'binance_future_test') && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            id="testnet"
                            type="checkbox"
                            checked={testnet}
                            onChange={(e) => setTestnet(e.target.checked)}
                            className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 focus:ring-2"
                          />
                          <Label htmlFor="testnet" className="text-sm font-medium text-gray-700">
                            وضع التجريب (Testnet)
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          تفعيل هذا الخيار يربط API keys بـ Binance Testnet بدلاً من Mainnet
                        </p>
                      </div>
                    )}

                    {/* Passphrase (for OKX, KuCoin and other exchanges that require it — NOT MT5, which has its own server field above) */}
                    {!isMT5 && SUPPORTED_EXCHANGES.find(e => e.id === exchange)?.requiresPassphrase && (
                      <div className="space-y-2">
                        <Label htmlFor="passphrase">عبارة المرور (Passphrase)</Label>
                        <Input
                          id="passphrase"
                          type="password"
                          placeholder="أدخل عبارة المرور الخاصة بالبورصة"
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          dir="ltr"
                          className="bg-background"
                          required
                        />
                        <p className="text-xs text-muted-foreground">هذه البورصة تتطلب عبارة مرور إضافية عند إنشاء مفتاح API</p>
                      </div>
                    )}

                    {/* Error */}
                    {error && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}

                    {/* Success */}
                    {success && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <p className="text-sm text-green-400">{success}</p>
                      </div>
                    )}

                    {/* Submit */}
                    <div className="flex items-center gap-3">
                      <Button
                        type="submit"
                        disabled={submitting || !apiKey || !apiSecret || (isMT5 && !passphrase)}
                        className="bg-teal-500 hover:bg-teal-600 text-background"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            {isMT5 ? 'جارٍ التحقق من حساب MT5...' : 'جارٍ التحقق والتشفير...'}
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4 ml-2" />
                            {isMT5 ? 'ربط حساب MT5' : 'إضافة وتحقق'}
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowForm(false)
                          setError('')
                          setSuccess('')
                        }}
                      >
                        إلغاء
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Credentials List */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-muted-foreground mx-auto animate-spin" />
            <p className="text-sm text-muted-foreground mt-3">جارٍ التحميل...</p>
          </div>
        ) : credentials.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="font-medium mb-1">لا توجد مفاتيح بعد</p>
              <p className="text-sm text-muted-foreground mb-4">
                أضف مفتاح API لربط حساب البورصة الخاص بك
              </p>
              <Button
                onClick={() => setShowForm(true)}
                variant="outline"
                className="border-teal-500/30 text-teal-400"
              >
                <Plus className="w-4 h-4 ml-2" />
                إضافة مفتاح أول
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {credentials.map((cred) => {
              const exInfo = SUPPORTED_EXCHANGES.find(e => e.id === cred.exchange)
              const permissions = JSON.parse(cred.permissions || '[]')

              return (
                <motion.div
                  key={cred.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <Card className="bg-card border-border hover:border-teal-500/20 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{exInfo?.icon || '💱'}</span>
                          <div>
                            <p className="font-medium">{cred.label}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {exInfo?.name || cred.exchange}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  cred.isValid
                                    ? 'border-green-500/30 text-green-400'
                                    : 'border-red-500/30 text-red-400'
                                }`}
                              >
                                {cred.isValid ? '✓ صالح' : '✗ غير صالح'}
                              </Badge>
                              {(cred.testnet || cred.exchange.includes('test')) && (
                                <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-400">
                                  🧪 Testnet
                                </Badge>
                              )}
                              {cred.exchange === 'mt5_demo' && (
                                <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-400">
                                  📋 Demo
                                </Badge>
                              )}
                              {(cred.exchange === 'mt5' || cred.exchange === 'mt5_demo') && (
                                <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-400">
                                  MT5
                                </Badge>
                              )}
                              {permissions.map((p: string) => (
                                <Badge key={p} variant="outline" className="text-xs text-muted-foreground">
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        {cred.exchange.includes('binance') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleTestnet(cred.id, !!cred.testnet)}
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          >
                            {cred.testnet ? '🌐' : '🧪'}
                          </Button>
                        )}
                        {/* زر تعيين كحساب نشط */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetActive(cred.id)}
                          disabled={activeSaving}
                          className={
                            activeCredentialId === cred.id
                              ? 'border-teal-500/50 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20'
                              : 'text-slate-400 hover:text-teal-400 hover:bg-teal-500/10'
                          }
                          title={activeCredentialId === cred.id ? 'الحساب النشط' : 'تعيين كحساب نشط'}
                        >
                          {activeCredentialId === cred.id ? '✓ نشط' : 'تفعيل'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(cred.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* ── Leverage Settings — testnet/paper only ── */}
        {hasTestAccount && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader
                className="cursor-pointer select-none pb-3"
                onClick={() => setLeverageOpen(v => !v)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚖️</span>
                    <CardTitle className="text-sm font-medium text-slate-200">
                      الرافعة المالية — الحسابات التجريبية
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30 bg-amber-400/5">
                      تجريبي فقط
                    </Badge>
                  </div>
                  {leverageOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
                <p className="text-xs text-slate-500 mt-1 mr-7">
                  تُطبَّق على حسابات Paper Trading وBinance Testnet فقط. لا تؤثر على الحسابات الحقيقية.
                </p>
              </CardHeader>

              <AnimatePresence>
                {leverageOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <CardContent className="pt-0 space-y-5">
                      <div className="h-px bg-slate-700/50" />

                      {/* Crypto */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm text-slate-300 flex items-center gap-2">
                            <span>₿</span> كريبتو (BTC، ETH، SOL...)
                          </Label>
                          <span className="text-sm font-mono font-bold text-orange-400">
                            {cryptoLev}x
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-6">1x</span>
                          <input
                            type="range"
                            min={1} max={10} step={1}
                            value={cryptoLev}
                            onChange={e => setCryptoLev(Number(e.target.value))}
                            className="flex-1 accent-orange-500 cursor-pointer"
                          />
                          <span className="text-xs text-slate-500 w-8">10x</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Spot = 1x بلا رافعة. هامش BTC 0.001 @ 77,000 = ${(77 / cryptoLev).toFixed(0)}
                        </p>
                      </div>

                      {/* Forex */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm text-slate-300 flex items-center gap-2">
                            <span>💱</span> فوركس (EUR/USD، GBP/USD...)
                          </Label>
                          <span className="text-sm font-mono font-bold text-blue-400">
                            {forexLev}x
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-6">10x</span>
                          <input
                            type="range"
                            min={10} max={500} step={10}
                            value={forexLev}
                            onChange={e => setForexLev(Number(e.target.value))}
                            className="flex-1 accent-blue-500 cursor-pointer"
                          />
                          <span className="text-xs text-slate-500 w-12">500x</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          هامش EUR/USD لوت 0.1 (10,000 وحدة) @ 1.08 = ${(10800 / forexLev).toFixed(0)}
                        </p>
                      </div>

                      {/* Gold */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm text-slate-300 flex items-center gap-2">
                            <span>🥇</span> معادن (XAU/USD، XAG/USD)
                          </Label>
                          <span className="text-sm font-mono font-bold text-yellow-400">
                            {goldLev}x
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-6">5x</span>
                          <input
                            type="range"
                            min={5} max={100} step={5}
                            value={goldLev}
                            onChange={e => setGoldLev(Number(e.target.value))}
                            className="flex-1 accent-yellow-500 cursor-pointer"
                          />
                          <span className="text-xs text-slate-500 w-12">100x</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          هامش XAU/USD 0.01 لوت @ 3,000 = ${(3000 * 0.01 * 100 / goldLev).toFixed(0)}
                        </p>
                      </div>

                      {/* Warning */}
                      <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300/80">
                          الرافعة المالية تضخّم الأرباح والخسائر. الرافعة العالية في التداول التجريبي تعطي نتائج غير واقعية.
                        </p>
                      </div>

                      {/* Save */}
                      <Button
                        onClick={handleSaveLeverage}
                        disabled={leverageSaving}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white"
                        size="sm"
                      >
                        {leverageSaving ? (
                          <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> جارٍ الحفظ...</>
                        ) : leverageSaved ? (
                          <><CheckCircle2 className="w-3 h-3 mr-2 text-green-400" /> تم الحفظ</>
                        ) : (
                          'حفظ إعدادات الرافعة'
                        )}
                      </Button>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        )}

    </SubPageLayout>
  )
}
