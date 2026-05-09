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
}

const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance', icon: '🔶' },
  { id: 'binance_test', name: 'Binance Spot Testnet', icon: '🧪' },
  { id: 'binance_future_test', name: 'Binance Futures Testnet', icon: '📈' },
  { id: 'kucoin', name: 'KuCoin', icon: '🟢', requiresPassphrase: false },
  { id: 'bybit', name: 'Bybit', icon: '🟠' },
  { id: 'okx', name: 'OKX', icon: '⚪', requiresPassphrase: true },
  { id: 'gateio', name: 'Gate.io', icon: '🔵' },
]

export default function ExchangeSettingsPage() {
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [exchange, setExchange] = useState('binance')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')

  // Auth handled by useAuth hook

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
  }, [fetchCredentials])

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
        body: JSON.stringify({ exchange, label: label || `${exchange}-key`, apiKey, apiSecret, passphrase: passphrase || undefined }),
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
      setShowForm(false)
      fetchCredentials()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
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
                        placeholder="أدخل مفتاح API"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        dir="ltr"
                        className="bg-background"
                        required
                      />
                    </div>

                    {/* API Secret */}
                    <div className="space-y-2">
                      <Label htmlFor="apiSecret">API Secret</Label>
                      <Input
                        id="apiSecret"
                        type="password"
                        placeholder="أدخل المفتاح السري"
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        dir="ltr"
                        className="bg-background"
                        required
                      />
                    </div>

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
                              {permissions.map((p: string) => (
                                <Badge key={p} variant="outline" className="text-xs text-muted-foreground">
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(cred.id)}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
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
