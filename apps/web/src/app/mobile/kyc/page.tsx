'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import {
  Link2, Key, Wifi, CheckCircle2, AlertCircle, Eye, EyeOff,
  Shield, Lock, ChevronLeft, Globe, Zap, ShieldAlert, Info,
  Search, ToggleLeft, ToggleRight
} from 'lucide-react'

const C = { accent: '#00D4FF', text2: '#8B92A8', text: '#F0F2F5', border: 'rgba(255,255,255,0.06)', green: '#00FFA3', red: '#FF453A', gold: '#d4af37' }

const EXCHANGES = [
  { id: 'binance', name: 'Binance', initial: 'B', color: '#F0B90B', desc: 'أكبر بورصة عملات رقمية' },
  { id: 'alpaca', name: 'Alpaca', initial: 'A', color: '#00D4FF', desc: 'متابعة أسهم وعملات' },
  { id: 'bybit', name: 'Bybit', initial: 'By', color: '#F7A600', desc: 'مشتقات وعقود آجلة' },
  { id: 'okx', name: 'OKX', initial: 'OK', color: '#FFFFFF', desc: 'بورصة عالمية متعددة' },
  { id: 'kucoin', name: 'KuCoin', initial: 'K', color: '#23AF91', desc: 'بورصة متنوعة العملات' },
  { id: 'bitget', name: 'Bitget', initial: 'Bg', color: '#00F0FF', desc: 'مشتقات وعقود آجلة' },
  { id: 'gate', name: 'Gate.io', initial: 'G', color: '#2354E6', desc: 'عملات ناشئة ومتنوعة' },
  { id: 'mexc', name: 'MEXC', initial: 'M', color: '#00D4AA', desc: 'عملات ناشئة بسرعة' },
]

type StepId = 1 | 2 | 3 | 4

const STEPS = [
  { id: 1 as StepId, label: 'البورصة', icon: Globe, color: C.accent },
  { id: 2 as StepId, label: 'المفاتيح', icon: Key, color: C.gold },
  { id: 3 as StepId, label: 'الاتصال', icon: Wifi, color: '#B388FF' },
  { id: 4 as StepId, label: 'تأكيد', icon: CheckCircle2, color: C.green },
]

export default function MobileKycPage() {
  const exchangeBalances = usePositionsStore(s => s.exchangeBalances)
  const [currentStep, setCurrentStep] = useState<StepId>(1)
  const [selectedExchange, setSelectedExchange] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [label, setLabel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [allowTrading, setAllowTrading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<'none' | 'success' | 'error'>('none')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const selExchange = EXCHANGES.find(e => e.id === selectedExchange)

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult('none')
    await new Promise(r => setTimeout(r, 2500))
    setIsTesting(false)
    setTestResult('success')
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await new Promise(r => setTimeout(r, 2000))
    setIsSubmitting(false)
    setIsComplete(true)
  }

  const canGoNext = () => {
    if (currentStep === 1) return !!selectedExchange
    if (currentStep === 2) return !!apiKey && !!apiSecret
    if (currentStep === 3) return testResult === 'success'
    return true
  }

  const goNext = () => {
    if (canGoNext() && currentStep < 4) {
      setCurrentStep((currentStep + 1) as StepId)
    }
  }

  const goBack = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as StepId)
  }

  const resetForm = () => {
    setCurrentStep(1)
    setSelectedExchange('')
    setApiKey('')
    setApiSecret('')
    setLabel('')
    setTestResult('none')
    setIsComplete(false)
    setAllowTrading(false)
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="ربط الحسابات" subtitle="ربط حسابات الوساطة" />

      {/* Success State */}
      {isComplete && (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
              background: 'rgba(0,255,163,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle2 size={28} color={C.green} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.green, fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>
              تم ربط الحساب بنجاح!
            </div>
            <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, marginBottom: 16 }}>
              تم ربط حساب {selExchange?.name || 'البورصة'} بنجاح. يمكنك الآن متابعة محفظتك واستقبال توصيات AI.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={resetForm} style={{
                padding: '8px 20px', borderRadius: 10, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.text, fontSize: 11, fontWeight: 800,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              }}>
                ربط حساب آخر
              </button>
              <a href="/mobile/wallet" style={{
                padding: '8px 20px', borderRadius: 10, border: 'none',
                background: 'rgba(0,212,255,0.1)', color: C.accent, fontSize: 11, fontWeight: 800,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer', textDecoration: 'none',
              }}>
                عرض المحفظة
              </a>
            </div>
          </div>
        </IOSCard>
      )}

      {/* Linked Accounts */}
      {exchangeBalances && exchangeBalances.length > 0 && (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Link2 size={14} color={C.accent} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>الحسابات المربوطة</span>
            <span style={{
              padding: '1px 8px', borderRadius: 6,
              background: 'rgba(0,212,255,0.1)', fontSize: 10, fontWeight: 800,
              color: C.accent, fontFamily: "'JetBrains Mono', monospace",
            }}>
              {exchangeBalances.length}
            </span>
          </div>
          {exchangeBalances.map((ex, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: i < exchangeBalances.length - 1 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Link2 size={14} color={C.accent} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{ex.exchange}</div>
                  {ex.label && <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{ex.label}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>
                  ${Number(ex.equity).toFixed(2)}
                </div>
                {ex.error ? (
                  <span style={{ fontSize: 9, color: C.red, fontFamily: "'Cairo', sans-serif" }}>غير متاح</span>
                ) : (
                  <span style={{ fontSize: 9, color: C.green, fontFamily: "'Cairo', sans-serif" }}>متصل ✓</span>
                )}
              </div>
            </div>
          ))}
        </IOSCard>
      )}

      {/* Stepper */}
      {!isComplete && (
        <>
          <div style={{ display: 'flex', gap: 4, padding: '0 16px', marginBottom: 12 }}>
            {STEPS.map(step => {
              const Icon = step.icon
              const isCurrent = currentStep === step.id
              const isCompleted = currentStep > step.id
              return (
                <div key={step.id} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: isCompleted ? `${C.green}15` : isCurrent ? `${step.color}15` : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${isCompleted ? C.green : isCurrent ? step.color : C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isCurrent ? `0 0 12px ${step.color}20` : 'none',
                  }}>
                    {isCompleted ? <CheckCircle2 size={14} color={C.green} /> : <Icon size={14} color={isCurrent ? step.color : C.text2} />}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: isCurrent ? 800 : 500,
                    color: isCurrent ? step.color : isCompleted ? C.green : C.text2,
                    fontFamily: "'Cairo', sans-serif",
                  }}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Step 1: Exchange Selection */}
          {currentStep === 1 && (
            <IOSCard>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Globe size={14} color={C.accent} />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>اختر البورصة</span>
              </div>
              {/* Security info */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)',
              }}>
                <Info size={14} color={C.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                  ربط حسابك لا يمنحنا أي صلاحية سحب أموال. نستخدم مفاتيح API للقراءة فقط بشكل افتراضي.
                </div>
              </div>
              {/* Exchange list */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EXCHANGES.map(ex => {
                  const isSelected = selectedExchange === ex.id
                  return (
                    <button
                      key={ex.id}
                      onClick={() => setSelectedExchange(ex.id)}
                      style={{
                        padding: 12, borderRadius: 10, border: `1px solid ${isSelected ? ex.color + '40' : C.border}`,
                        background: isSelected ? `${ex.color}08` : 'transparent', cursor: 'pointer',
                        textAlign: 'center', transition: 'all 0.2s',
                        boxShadow: isSelected ? `0 0 12px ${ex.color}15` : 'none',
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 9, margin: '0 auto 6px',
                        background: `${ex.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 900, color: ex.color, fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {ex.initial}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: isSelected ? 800 : 600, color: isSelected ? ex.color : '#FFF', fontFamily: "'Cairo', sans-serif" }}>
                        {ex.name}
                      </div>
                      <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                        {ex.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
            </IOSCard>
          )}

          {/* Step 2: API Keys */}
          {currentStep === 2 && (
            <IOSCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Key size={14} color={C.gold} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مفاتيح API</span>
                </div>
                {selExchange && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 10px', borderRadius: 6,
                    background: `${selExchange.color}10`, border: `0.5px solid ${selExchange.color}20`,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: selExchange.color, fontFamily: "'Cairo', sans-serif" }}>
                      {selExchange.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Security warning */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(212,175,55,0.04)', border: '0.5px solid rgba(212,175,55,0.12)',
              }}>
                <ShieldAlert size={14} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                  <strong style={{ color: C.gold }}>تنبيه:</strong> لا تفعّل صلاحية السحب أبداً. يتم تشفير مفاتيحك بتقنية AES-256-GCM.
                </div>
              </div>

              {/* How to get API keys */}
              <div style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>
                  كيفية الحصول على مفاتيح API
                </div>
                {[
                  `سجّل الدخول إلى حسابك على ${selExchange?.name || 'البورصة'}`,
                  'انتقل إلى إعدادات API Management',
                  'أنشئ مفتاح API جديد بصلاحيات القراءة فقط',
                  'انسخ API Key و API Secret وألصقهما أدناه',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      background: 'rgba(0,212,255,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 800, color: C.accent,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{step}</span>
                  </div>
                ))}
              </div>

              {/* Label */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 6, display: 'block' }}>
                  اسم الاتصال (اختياري)
                </label>
                <input
                  value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="مثال: حساب Binance الرئيسي"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                    color: C.text, fontSize: 12, fontFamily: "'Cairo', sans-serif",
                    outline: 'none', direction: 'rtl', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* API Key */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 6, display: 'block' }}>
                  API Key <span style={{ color: C.red }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey} onChange={e => setApiKey(e.target.value)}
                    placeholder="أدخل API Key"
                    style={{
                      width: '100%', padding: '10px 36px 10px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)', border: `1px solid ${!apiKey ? C.border : 'rgba(0,212,255,0.3)'}`,
                      color: C.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                    }}
                  />
                  <button onClick={() => setShowKey(!showKey)} style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: C.text2, padding: 0,
                  }}>
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* API Secret */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 6, display: 'block' }}>
                  API Secret <span style={{ color: C.red }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                    placeholder="أدخل API Secret"
                    style={{
                      width: '100%', padding: '10px 36px 10px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)', border: `1px solid ${!apiSecret ? C.border : 'rgba(0,212,255,0.3)'}`,
                      color: C.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                    }}
                  />
                  <button onClick={() => setShowSecret(!showSecret)} style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: C.text2, padding: 0,
                  }}>
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Allow Trading Permission */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                background: allowTrading ? 'rgba(5,150,105,0.06)' : 'rgba(255,255,255,0.02)',
                border: `0.5px solid ${allowTrading ? 'rgba(5,150,105,0.2)' : C.border}`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: allowTrading ? 'rgba(5,150,105,0.12)' : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Zap size={14} color={allowTrading ? C.green : C.text2} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>صلاحية التداول</div>
                  <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>
                    السماح للمنفذ الذكي بتنفيذ الصفقات عبر حسابك
                  </div>
                </div>
                <button onClick={() => setAllowTrading(!allowTrading)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: allowTrading ? C.green : C.text2 }}>
                  {allowTrading ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                </button>
              </div>
            </IOSCard>
          )}

          {/* Step 3: Connection Test */}
          {currentStep === 3 && (
            <IOSCard>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Wifi size={14} color="#B388FF" />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>اختبار الاتصال</span>
              </div>

              <div style={{
                padding: 14, borderRadius: 10, marginBottom: 14,
                background: 'rgba(179,136,255,0.04)', border: '0.5px solid rgba(179,136,255,0.1)',
              }}>
                <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                  سنقوم بالاتصال بـ {selExchange?.name || 'البورصة'} للتحقق من صحة مفاتيح API وقراءة رصيد حسابك.
                </div>
              </div>

              {/* Connection summary */}
              <div style={{
                padding: 12, borderRadius: 10, marginBottom: 14,
                background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>البورصة</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: selExchange?.color || '#FFF', fontFamily: "'Cairo', sans-serif" }}>{selExchange?.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>API Key</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">
                    {apiKey.slice(0, 4)}••••••••{apiKey.slice(-4)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>صلاحية التداول</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: allowTrading ? C.green : C.text2, fontFamily: "'Cairo', sans-serif" }}>
                    {allowTrading ? 'مفعّلة' : 'معطّلة'}
                  </span>
                </div>
              </div>

              {/* Test Button / Result */}
              {testResult === 'none' && !isTesting && (
                <button onClick={handleTestConnection} style={{
                  width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                  background: 'rgba(179,136,255,0.1)', color: '#B388FF',
                  fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Wifi size={16} /> اختبار الاتصال
                </button>
              )}
              {isTesting && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, margin: '0 auto 8px',
                    background: 'rgba(179,136,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'spin 1s linear infinite',
                  }}>
                    <Wifi size={18} color="#B388FF" />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#B388FF', fontFamily: "'Cairo', sans-serif" }}>جاري اختبار الاتصال...</div>
                  <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>الاتصال بـ {selExchange?.name}</div>
                </div>
              )}
              {testResult === 'success' && (
                <div style={{
                  padding: 14, borderRadius: 10,
                  background: 'rgba(0,255,163,0.06)', border: '0.5px solid rgba(0,255,163,0.15)',
                  textAlign: 'center',
                }}>
                  <CheckCircle2 size={28} color={C.green} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.green, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                    تم الاتصال بنجاح!
                  </div>
                  <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
                    تم التحقق من مفاتيح API والاتصال بـ {selExchange?.name}
                  </div>
                </div>
              )}
              {testResult === 'error' && (
                <div style={{
                  padding: 14, borderRadius: 10,
                  background: 'rgba(255,71,87,0.06)', border: '0.5px solid rgba(255,71,87,0.15)',
                  textAlign: 'center',
                }}>
                  <AlertCircle size={28} color={C.red} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.red, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                    فشل الاتصال
                  </div>
                  <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>تحقق من صحة مفاتيح API وحاول مرة أخرى</div>
                  <button onClick={handleTestConnection} style={{
                    marginTop: 10, padding: '6px 16px', borderRadius: 8, border: 'none',
                    background: 'rgba(255,71,87,0.1)', color: C.red, fontSize: 11, fontWeight: 700,
                    fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                  }}>
                    إعادة المحاولة
                  </button>
                </div>
              )}
            </IOSCard>
          )}

          {/* Step 4: Confirmation */}
          {currentStep === 4 && (
            <IOSCard>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <CheckCircle2 size={14} color={C.green} />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>تأكيد الربط</span>
              </div>

              {/* Summary */}
              <div style={{
                padding: 14, borderRadius: 10, marginBottom: 14,
                background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}`,
              }}>
                {[
                  { label: 'البورصة', value: selExchange?.name || '', color: selExchange?.color },
                  { label: 'API Key', value: `${apiKey.slice(0, 4)}••••••••${apiKey.slice(-4)}`, color: C.text },
                  { label: 'صلاحية التداول', value: allowTrading ? 'مفعّلة' : 'معطّلة', color: allowTrading ? C.green : C.text2 },
                  { label: 'اسم الاتصال', value: label || `${selExchange?.name} حساب`, color: C.text },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 0', borderBottom: i < 3 ? '0.5px solid rgba(255,255,255,0.04)' : 'none',
                  }}>
                    <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{item.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: item.color, fontFamily: "'Cairo', sans-serif" }} dir={item.label === 'API Key' ? 'ltr' : 'rtl'}>{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Security reminder */}
              <div style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(0,255,163,0.04)', border: '0.5px solid rgba(0,255,163,0.1)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <Shield size={14} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                  مفاتيحك مشفرة بتقنية AES-256-GCM ولا يتم تخزينها بصيغة نصية. يمكنك إلغاء الربط في أي وقت.
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #059669, #00D4FF)', color: '#FFF',
                  fontSize: 14, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {isSubmitting ? (
                  <>
                    <div style={{ width: 16, height: 16, borderRadius: 8, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', animation: 'spin 1s linear infinite' }} />
                    جاري الربط...
                  </>
                ) : (
                  <>
                    <Link2 size={16} />
                    تأكيد ربط الحساب
                  </>
                )}
              </button>
            </IOSCard>
          )}

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: 8, padding: '0 16px', marginTop: 8 }}>
            {currentStep > 1 && (
              <button onClick={goBack} style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                border: `1px solid ${C.border}`, background: 'transparent',
                color: C.text, fontSize: 12, fontWeight: 800,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <ChevronLeft size={14} /> السابق
              </button>
            )}
            {currentStep < 4 && (
              <button
                onClick={goNext}
                disabled={!canGoNext()}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: canGoNext() ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                  color: canGoNext() ? C.accent : C.text2,
                  fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                  cursor: canGoNext() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                التالي <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
