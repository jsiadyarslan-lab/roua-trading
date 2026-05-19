'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
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
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
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
]

export default function ExchangeSettingsPage() {
  const router = useRouter()
  const { loading: authLoading, isGuest } = useAuth()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // V165: Server IP for Binance IP whitelist
  const [serverIp, setServerIp] = useState<string | null>(null)
  const [ipLoading, setIpLoading] = useState(false)
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

  useEffect(() => {
    fetchCredentials()
    fetchServerIp()
  }, [fetchCredentials, fetchServerIp])

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
        const errorMsg = data.error || data.message || 'فشل في إضافة المفتاح'
        throw new Error(errorMsg)
      }

      setSuccess('تم إضافة المفتاح بنجاح! ✅')
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
                      <div className="grid grid-cols-5 gap-2">
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

                    {/* API Key */}
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

                    {/* API Secret / Private Key */}
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

                    {/* Passphrase (for OKX and other exchanges that require it) */}
                    {SUPPORTED_EXCHANGES.find(e => e.id === exchange)?.requiresPassphrase && (
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
                        disabled={submitting || !apiKey || !apiSecret}
                        className="bg-teal-500 hover:bg-teal-600 text-background"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            جارٍ التحقق والتشفير...
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4 ml-2" />
                            إضافة وتحقق
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

    </SubPageLayout>
  )
}
