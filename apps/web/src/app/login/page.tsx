'use client'

import { Suspense, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Fingerprint, TrendingUp, ArrowRight, Mail, Shield, KeyRound, Timer } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Login Page — Roua Trading (رؤى)
 *
 * Authentication methods:
 * 1. Google OAuth (if configured)
 * 2. Passkey / WebAuthn
 * 3. Email login (direct or OTP verification)
 */

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState<'google' | 'passkey' | 'email' | 'otp-send' | 'otp-verify' | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState(() => {
    const urlError = searchParams.get('error')
    if (urlError === 'access_denied') return 'تم رفض الوصول. حاول مرة أخرى.'
    if (urlError === 'oauth_not_configured') return 'تسجيل الدخول عبر Google غير مُفعّل حالياً.'
    if (urlError === 'token_exchange_failed') return 'فشل الاتصال بـ Google. حاول لاحقاً.'
    if (urlError === 'no_access_token') return 'فشل في الحصول على رمز الوصول من Google.'
    if (urlError === 'user_info_failed') return 'فشل في جلب معلومات الحساب.'
    if (urlError === 'no_email') return 'لم يتم العثور على بريد إلكتروني في حساب Google.'
    if (urlError === 'db_unavailable') return 'قاعدة البيانات غير متاحة حالياً.'
    if (urlError === 'user_creation_failed') return 'فشل إنشاء حساب المستخدم.'
    if (urlError === 'session_creation_failed') return 'فشل إنشاء الجلسة. يرجى المحاولة مرة أخرى.'
    if (urlError === 'unknown') return 'حدث خطأ غير متوقع. حاول مرة أخرى.'
    return ''
  })

  // OTP state
  const [loginMethod, setLoginMethod] = useState<'direct' | 'otp'>('otp')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpTimer, setOtpTimer] = useState(0)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startOtpTimer = () => {
    setOtpTimer(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits filled
    if (value && index === 5 && newOtp.every(d => d !== '')) {
      handleVerifyOtp(newOtp.join(''))
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      const newOtp = [...otp]
      for (let i = 0; i < 6; i++) {
        newOtp[i] = pasted[i] || ''
      }
      setOtp(newOtp)
      if (pasted.length === 6) {
        handleVerifyOtp(pasted)
      } else {
        otpInputRefs.current[pasted.length]?.focus()
      }
    }
  }

  const handleGoogleLogin = async () => {
    setLoading('google')
    setError('')
    try {
      const checkRes = await fetch('/api/auth/signin/google', {
        method: 'GET',
        redirect: 'manual',
      })

      if (checkRes.status === 501) {
        const data = await checkRes.json()
        setError(data.message || 'تسجيل الدخول عبر Google غير مُفعّل حالياً.')
        setLoading(null)
        return
      }

      window.location.href = '/api/auth/signin/google'
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل الدخول عبر Google')
      setLoading(null)
    }
  }

  const handlePasskeyLogin = async () => {
    setLoading('passkey')
    setError('')
    try {
      if (!window.PublicKeyCredential) {
        setError('متصفحك لا يدعم Passkeys. استخدم الدخول بالبريد الإلكتروني.')
        setLoading(null)
        return
      }

      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      if (!available) {
        setError('لا يوجد مُصادق Passkey متاح على هذا الجهاز.')
        setLoading(null)
        return
      }

      const apiTarget = process.env.NEXT_PUBLIC_API_URL || ''
      const challengeUrl = apiTarget
        ? `${apiTarget}/api/auth/challenge?email=passkey@roua.auto`
        : '/api/auth/challenge?email=passkey@roua.auto'

      const challengeRes = await fetch(challengeUrl, {
        signal: AbortSignal.timeout(10000),
      })

      if (!challengeRes.ok) {
        const challenge = new Uint8Array(32)
        crypto.getRandomValues(challenge)

        const credential = await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: 'preferred',
            rpId: window.location.hostname,
          },
        }) as PublicKeyCredential | null

        if (credential) {
          const verifyRes = await fetch('/api/auth/passkey/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: credential.id,
              rawId: Array.from(new Uint8Array(credential.rawId)),
              response: {
                authenticatorData: Array.from(new Uint8Array((credential.response as AuthenticatorAssertionResponse).authenticatorData)),
                clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)),
                signature: Array.from(new Uint8Array((credential.response as AuthenticatorAssertionResponse).signature)),
              },
            }),
          })

          if (verifyRes.ok) {
            const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
            router.push(callbackUrl)
          } else {
            const data = await verifyRes.json()
            setError(data.error || 'فشل التحقق من Passkey')
          }
        }
        return
      }

      const challengeData = await challengeRes.json()
      const challengeBuffer = Uint8Array.from(atob(challengeData.challenge), c => c.charCodeAt(0))

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBuffer,
          timeout: 60000,
          userVerification: 'preferred',
          rpId: window.location.hostname,
          allowCredentials: challengeData.allowCredentials?.map((c: any) => ({
            id: Uint8Array.from(atob(c.id), (ch) => ch.charCodeAt(0)),
            type: c.type || 'public-key',
            transports: c.transports || ['internal'],
          })),
        },
      }) as PublicKeyCredential | null

      if (credential) {
        const verifyRes = await fetch('/api/auth/passkey/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: credential.id,
            rawId: Array.from(new Uint8Array(credential.rawId)),
            response: {
              authenticatorData: Array.from(new Uint8Array((credential.response as AuthenticatorAssertionResponse).authenticatorData)),
              clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)),
              signature: Array.from(new Uint8Array((credential.response as AuthenticatorAssertionResponse).signature)),
            },
            email: challengeData.email || 'passkey@roua.auto',
          }),
        })

        if (verifyRes.ok) {
          const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
          router.push(callbackUrl)
        } else {
          const data = await verifyRes.json()
          setError(data.error || 'فشل التحقق من Passkey')
        }
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('')
      } else {
        setError(err.message || 'فشل تسجيل الدخول عبر Passkey')
      }
    } finally {
      setLoading(null)
    }
  }

  const handleEmailLogin = async () => {
    if (!email.trim()) {
      setError('يرجى إدخال بريدك الإلكتروني')
      return
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('يرجى إدخال بريد إلكتروني صحيح')
      return
    }

    setLoading('email')
    setError('')

    try {
      // SECURITY: Use POST instead of GET to prevent email leaking in URL/logs/history
      const res = await fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
          router.push(callbackUrl)
        } else {
          setError(data.error === 'GUEST_LOGIN_BLOCKED' ? 'تسجيل الدخول كضيف غير مسموح. استخدم بريدك الحقيقي.' : 'فشل تسجيل الدخول. حاول مرة أخرى.')
        }
      } else {
        setError('فشل تسجيل الدخول. حاول مرة أخرى.')
      }
    } catch {
      setError('حدث خطأ في الاتصال. حاول مرة أخرى.')
    } finally {
      setLoading(null)
    }
  }

  const handleSendOtp = async () => {
    if (!email.trim()) {
      setError('يرجى إدخال بريدك الإلكتروني')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('يرجى إدخال بريد إلكتروني صحيح')
      return
    }

    setLoading('otp-send')
    setError('')

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setOtpSent(true)
        setOtp(['', '', '', '', '', ''])
        startOtpTimer()
        // Focus first OTP input
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
      } else if (res.status === 429) {
        setError(data.message || 'طلبات كثيرة. حاول مرة أخرى بعد قليل.')
      } else if (data.error === 'GUEST_LOGIN_BLOCKED') {
        setError('تسجيل الدخول كضيف غير مسموح. استخدم بريدك الحقيقي.')
      } else {
        setError(data.message || 'فشل إرسال رمز التحقق. حاول مرة أخرى.')
      }
    } catch {
      setError('حدث خطأ في الاتصال. حاول مرة أخرى.')
    } finally {
      setLoading(null)
    }
  }

  const handleVerifyOtp = async (otpCode?: string) => {
    const code = otpCode || otp.join('')
    if (code.length !== 6) {
      setError('يرجى إدخال رمز التحقق كاملاً')
      return
    }

    setLoading('otp-verify')
    setError('')

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      })

      const data = await res.json()

      if (res.ok && data.authenticated) {
        const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
        router.push(callbackUrl)
      } else if (data.error === 'INVALID_OTP') {
        setError(data.message || 'رمز التحقق غير صحيح')
        setOtp(['', '', '', '', '', ''])
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
      } else if (data.error === 'OTP_EXPIRED') {
        setError(data.message || 'انتهت صلاحية رمز التحقق')
        setOtpSent(false)
        setOtp(['', '', '', '', '', ''])
      } else {
        setError(data.message || 'فشل التحقق. حاول مرة أخرى.')
      }
    } catch {
      setError('حدث خطأ في الاتصال. حاول مرة أخرى.')
    } finally {
      setLoading(null)
    }
  }

  const switchToDirect = () => {
    setLoginMethod('direct')
    setOtpSent(false)
    setOtp(['', '', '', '', '', ''])
    setError('')
  }

  const switchToOtp = () => {
    setLoginMethod('otp')
    setOtpSent(false)
    setOtp(['', '', '', '', '', ''])
    setError('')
  }

  return (
    <div className="relative min-h-screen text-white overflow-hidden flex items-center justify-center" dir="rtl" style={{ background: '#000000' }}>
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.10) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(0,212,255,0.05) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(125,211,252,0.04) 0%, transparent 50%), #000000',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-2xl p-8 shadow-2xl"
        >
          {/* Logo + Brand */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-center mb-8"
          >
            <div className="flex items-center justify-center gap-2.5 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #0891b2, #00d4ff)',
                  boxShadow: '0 0 25px rgba(0, 212, 255, 0.2)',
                }}
              >
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1
                  className="text-3xl font-bold leading-none"
                  style={{
                    fontFamily: 'var(--font-ar)',
                    background: 'linear-gradient(135deg, #00d4ff, #7dd3fc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  رؤى
                </h1>
              </div>
            </div>
            <p className="text-white/25 text-[10px] tracking-[0.4em] font-semibold" style={{ fontFamily: 'var(--font-brand)' }}>
              ROUA TRADING
            </p>
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="text-lg font-bold text-center mb-6"
            style={{ color: '#E2E8F0', fontFamily: 'var(--font-ar)' }}
          >
            مرحباً بك في رؤى
          </motion.h2>

          {/* Email Input */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mb-3"
          >
            <div className="relative">
              <Mail className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (otpSent) { setOtpSent(false); setOtp(['', '', '', '', '', '']) } }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (loginMethod === 'direct') handleEmailLogin()
                    else if (!otpSent) handleSendOtp()
                  }
                }}
                placeholder="أدخل بريدك الإلكتروني"
                dir="ltr"
                disabled={otpSent}
                className="w-full py-3.5 pe-10 ps-4 rounded-xl text-sm outline-none transition-all duration-200 placeholder:text-white/20 disabled:opacity-50"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#E2E8F0',
                  fontFamily: 'var(--font-en)',
                }}
                onFocus={(e) => {
                  if (!otpSent) {
                    e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                  }
                }}
                onBlur={(e) => {
                  if (!otpSent) {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  }
                }}
              />
            </div>
          </motion.div>

          {/* Login Method: OTP or Direct */}
          <AnimatePresence mode="wait">
            {loginMethod === 'otp' ? (
              <motion.div
                key="otp-method"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {!otpSent ? (
                  /* Send OTP Button */
                  <motion.button
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55, duration: 0.4 }}
                    onClick={handleSendOtp}
                    disabled={loading !== null}
                    whileHover={{ scale: 1.01, boxShadow: '0 0 30px rgba(0, 212, 255, 0.2)' }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl
                               bg-gradient-to-l from-cyan-600 to-cyan-400 text-white font-bold text-sm
                               hover:from-cyan-500 hover:to-cyan-300
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-all duration-200 mb-4"
                    style={{ boxShadow: '0 0 20px rgba(0, 212, 255, 0.15)' }}
                  >
                    <KeyRound className="w-4 h-4" />
                    <span style={{ fontFamily: 'var(--font-ar)' }}>{loading === 'otp-send' ? 'جارٍ الإرسال...' : 'إرسال رمز التحقق'}</span>
                  </motion.button>
                ) : (
                  /* OTP Input + Verify */
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-4"
                  >
                    <p className="text-center text-white/40 text-xs mb-3" style={{ fontFamily: 'var(--font-ar)' }}>
                      أدخل الرمز المُرسل إلى <span dir="ltr" className="text-white/60">{email}</span>
                    </p>

                    {/* 6-digit OTP Input */}
                    <div className="flex justify-center gap-2 mb-4" dir="ltr" onPaste={handleOtpPaste}>
                      {otp.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => { otpInputRefs.current[idx] = el }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          className="w-11 h-12 text-center text-lg font-bold rounded-lg outline-none transition-all duration-200"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: digit ? '1px solid rgba(0,212,255,0.5)' : '1px solid rgba(255,255,255,0.1)',
                            color: '#00d4ff',
                            fontFamily: 'var(--font-en)',
                            boxShadow: digit ? '0 0 10px rgba(0,212,255,0.15)' : 'none',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)'
                            e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                          }}
                          onBlur={(e) => {
                            if (!digit) {
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                            }
                          }}
                        />
                      ))}
                    </div>

                    {/* Verify Button */}
                    <motion.button
                      onClick={() => handleVerifyOtp()}
                      disabled={loading !== null || otp.some(d => !d)}
                      whileHover={{ scale: 1.01, boxShadow: '0 0 30px rgba(0, 212, 255, 0.2)' }}
                      whileTap={{ scale: 0.99 }}
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl
                                 bg-gradient-to-l from-cyan-600 to-cyan-400 text-white font-bold text-sm
                                 hover:from-cyan-500 hover:to-cyan-300
                                 disabled:opacity-40 disabled:cursor-not-allowed
                                 transition-all duration-200 mb-3"
                      style={{ boxShadow: '0 0 20px rgba(0, 212, 255, 0.15)' }}
                    >
                      <span style={{ fontFamily: 'var(--font-ar)' }}>{loading === 'otp-verify' ? 'جارٍ التحقق...' : 'تسجيل الدخول'}</span>
                    </motion.button>

                    {/* Resend OTP */}
                    <div className="text-center">
                      {otpTimer > 0 ? (
                        <div className="flex items-center justify-center gap-1.5 text-white/25 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>
                          <Timer className="w-3 h-3" />
                          <span>إعادة الإرسال بعد {otpTimer} ثانية</span>
                        </div>
                      ) : (
                        <button
                          onClick={handleSendOtp}
                          disabled={loading !== null}
                          className="text-cyan-400/70 hover:text-cyan-400 text-xs transition-colors disabled:opacity-40"
                          style={{ fontFamily: 'var(--font-ar)' }}
                        >
                          إعادة إرسال الرمز
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Switch to Direct Login */}
                <div className="text-center">
                  <button
                    onClick={switchToDirect}
                    className="text-white/25 hover:text-white/40 text-[11px] transition-colors"
                    style={{ fontFamily: 'var(--font-ar)' }}
                  >
                    ← تسجيل الدخول المباشر
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="direct-method"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Email Login Button — Direct */}
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55, duration: 0.4 }}
                  onClick={handleEmailLogin}
                  disabled={loading !== null}
                  whileHover={{ scale: 1.01, boxShadow: '0 0 30px rgba(0, 212, 255, 0.2)' }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl
                             bg-gradient-to-l from-cyan-600 to-cyan-400 text-white font-bold text-sm
                             hover:from-cyan-500 hover:to-cyan-300
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-all duration-200 mb-3"
                  style={{ boxShadow: '0 0 20px rgba(0, 212, 255, 0.15)' }}
                >
                  <Mail className="w-4 h-4" />
                  <span style={{ fontFamily: 'var(--font-ar)' }}>{loading === 'email' ? 'جارٍ الدخول...' : 'تسجيل الدخول بالبريد'}</span>
                </motion.button>

                {/* Switch to OTP Login */}
                <div className="text-center mb-4">
                  <button
                    onClick={switchToOtp}
                    className="text-white/25 hover:text-white/40 text-[11px] transition-colors"
                    style={{ fontFamily: 'var(--font-ar)' }}
                  >
                    ← تسجيل الدخول برمز التحقق
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div className="flex items-center gap-4 my-4">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-white/20 text-[11px]" style={{ fontFamily: 'var(--font-ar)' }}>أو</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Google Button */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            onClick={handleGoogleLogin}
            disabled={loading !== null}
            whileHover={{ scale: 1.01, boxShadow: '0 0 25px rgba(66, 133, 244, 0.15)' }}
            whileTap={{ scale: 0.99 }}
            className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-xl
                       bg-white/[0.04] border border-white/10 text-white font-medium text-sm
                       hover:bg-white/[0.07] hover:border-white/15
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200 mb-3"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span style={{ fontFamily: 'var(--font-ar)' }}>{loading === 'google' ? 'جارٍ الاتصال...' : 'Google'}</span>
          </motion.button>

          {/* Passkey Button */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.65, duration: 0.4 }}
            onClick={handlePasskeyLogin}
            disabled={loading !== null}
            whileHover={{ scale: 1.01, boxShadow: '0 0 25px rgba(45, 212, 191, 0.15)' }}
            whileTap={{ scale: 0.99 }}
            className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-xl
                       bg-white/[0.04] border border-white/10 text-white font-medium text-sm
                       hover:bg-white/[0.07] hover:border-white/15
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200 mb-4"
          >
            <Fingerprint className="w-4 h-4" style={{ color: '#00d4ff' }} />
            <span style={{ fontFamily: 'var(--font-ar)' }}>{loading === 'passkey' ? 'جارٍ التحقق...' : 'Passkey'}</span>
          </motion.button>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
              style={{ fontFamily: 'var(--font-ar)' }}
            >
              {error}
            </motion.div>
          )}

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="mt-6 flex items-center justify-center gap-4"
          >
            <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
              <Shield className="w-3 h-3" />
              <span style={{ fontFamily: 'var(--font-ar)' }}>مشفر بالكامل</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-white/10" />
            <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
              <Fingerprint className="w-3 h-3" />
              <span style={{ fontFamily: 'var(--font-ar)' }}>بدون كلمة مرور</span>
            </div>
          </motion.div>

          {/* Terms & Privacy */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.5 }}
            className="mt-4 text-center text-white/15 text-[10px]"
            style={{ fontFamily: 'var(--font-ar)' }}
          >
            بتسجيل الدخول، أنت توافق على{' '}
            <a href="/terms" className="text-white/25 hover:text-white/40 transition-colors underline decoration-white/10">شروط الاستخدام</a>
            {' '}و{' '}
            <a href="/privacy" className="text-white/25 hover:text-white/40 transition-colors underline decoration-white/10">سياسة الخصوصية</a>
          </motion.p>
        </motion.div>

        {/* Bottom Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="text-center mt-5"
        >
          <p className="text-white/15 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>
            <a href="/" className="hover:text-white/30 transition-colors flex items-center justify-center gap-1.5">
              <ArrowRight className="w-3 h-3" />
              العودة إلى الصفحة الرئيسية
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
