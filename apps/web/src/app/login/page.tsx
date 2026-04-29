'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Fingerprint, TrendingUp, ArrowRight, Mail, Shield } from 'lucide-react'
import { motion } from 'framer-motion'

/**
 * Login Page — Roua Trading (رؤى)
 *
 * Authentication methods:
 * 1. Google OAuth (if configured)
 * 2. Passkey / WebAuthn
 * 3. Email (quick guest access)
 * 4. Direct guest access → /dashboard
 */

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState<'google' | 'passkey' | 'email' | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState(() => {
    const urlError = searchParams.get('error')
    if (urlError === 'access_denied') return 'تم رفض الوصول. حاول مرة أخرى.'
    if (urlError === 'oauth_not_configured') return 'تسجيل الدخول عبر Google غير مُفعّل حالياً.'
    if (urlError === 'token_exchange_failed') return 'فشل الاتصال بـ Google. حاول لاحقاً.'
    if (urlError === 'user_info_failed') return 'فشل في جلب معلومات الحساب.'
    if (urlError === 'db_unavailable') return 'قاعدة البيانات غير متاحة حالياً.'
    return ''
  })

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
        setError('متصفحك لا يدعم Passkeys. استخدم الدخول بالبريد أو كضيف.')
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
            router.push('/dashboard')
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
            id: Uint8Array.from(atob(c.id), (ch: number) => ch),
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
          router.push('/dashboard')
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

    setLoading('email')
    setError('')

    try {
      // Call /api/auth/me to auto-create a session, then redirect to dashboard
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        router.push('/dashboard')
      } else {
        setError('فشل تسجيل الدخول. حاول مرة أخرى.')
      }
    } catch {
      setError('حدث خطأ في الاتصال. حاول مرة أخرى.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative min-h-screen text-white overflow-hidden flex items-center justify-center" dir="rtl" style={{ background: '#06090f' }}>
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16,185,129,0.08) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(59,130,246,0.05) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(139,92,246,0.04) 0%, transparent 50%), #06090f',
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
                  background: 'linear-gradient(135deg, #059669, #10B981)',
                  boxShadow: '0 0 25px rgba(16, 185, 129, 0.2)',
                }}
              >
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1
                  className="text-3xl font-bold leading-none"
                  style={{
                    fontFamily: 'var(--font-ar)',
                    background: 'linear-gradient(135deg, #10B981, #3B82F6)',
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
            className="mb-4"
          >
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailLogin()}
                placeholder="بريدك الإلكتروني"
                dir="ltr"
                className="w-full py-3 pe-10 ps-4 rounded-xl text-sm outline-none transition-all duration-200 placeholder:text-white/20"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#E2E8F0',
                  fontFamily: 'var(--font-en)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
              />
            </div>
          </motion.div>

          {/* Google Button */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55, duration: 0.4 }}
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
            transition={{ delay: 0.6, duration: 0.4 }}
            onClick={handlePasskeyLogin}
            disabled={loading !== null}
            whileHover={{ scale: 1.01, boxShadow: '0 0 25px rgba(45, 212, 191, 0.15)' }}
            whileTap={{ scale: 0.99 }}
            className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-xl
                       bg-white/[0.04] border border-white/10 text-white font-medium text-sm
                       hover:bg-white/[0.07] hover:border-white/15
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200 mb-3"
          >
            <Fingerprint className="w-4 h-4" style={{ color: '#2DD4BF' }} />
            <span style={{ fontFamily: 'var(--font-ar)' }}>{loading === 'passkey' ? 'جارٍ التحقق...' : 'Passkey'}</span>
          </motion.button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-white/20 text-[11px]" style={{ fontFamily: 'var(--font-ar)' }}>أو</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Guest Access */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            onClick={() => router.push('/dashboard')}
            whileHover={{ scale: 1.01 }}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl
                       bg-gradient-to-l from-emerald-600 to-emerald-500 text-white font-bold text-sm
                       hover:from-emerald-500 hover:to-emerald-400
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200"
            style={{ boxShadow: '0 0 20px rgba(16, 185, 129, 0.1)' }}
          >
            <Shield className="w-4 h-4" />
            <span style={{ fontFamily: 'var(--font-ar)' }}>دخول كضيف — تجربة فورية</span>
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
        </motion.div>

        {/* Bottom Link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="text-center mt-5 text-white/15 text-xs"
          style={{ fontFamily: 'var(--font-ar)' }}
        >
          <a href="/" className="hover:text-white/30 transition-colors flex items-center justify-center gap-1.5">
            <ArrowRight className="w-3 h-3" />
            العودة إلى الصفحة الرئيسية
          </a>
        </motion.p>
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
