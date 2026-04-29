'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Fingerprint } from 'lucide-react'
import { motion } from 'framer-motion'

const SpaceBackground = dynamic(() => import('@/components/landing/SpaceBackground'), { ssr: false })

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<'google' | 'passkey' | null>(null)
  const [error, setError] = useState('')

  const handleGoogleLogin = async () => {
    setLoading('google')
    setError('')
    try {
      // Use NextAuth Google provider
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
      // WebAuthn / Passkey authentication
      if (!window.PublicKeyCredential) {
        setError('متصفحك لا يدعم Passkeys. استخدم Google بدلاً من ذلك.')
        setLoading(null)
        return
      }

      // Check if platform authenticator is available
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      if (!available) {
        setError('لا يوجد مُصادق Passkey متاح على هذا الجهاز.')
        setLoading(null)
        return
      }

      // Start WebAuthn authentication
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
        // Send credential to backend for verification
        const res = await fetch('/api/auth/passkey/verify', {
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

        if (res.ok) {
          router.push('/dashboard')
        } else {
          const data = await res.json()
          setError(data.error || 'فشل التحقق من Passkey')
        }
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        // User cancelled the authentication
        setError('')
      } else {
        setError(err.message || 'فشل تسجيل الدخول عبر Passkey')
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden flex items-center justify-center" dir="rtl">
      <SpaceBackground />

      <div className="relative z-10 w-full max-w-md mx-4">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-5xl font-bold bg-gradient-to-l from-teal-400 via-teal-300 to-amber-400 bg-clip-text text-transparent">
              رؤى
            </h1>
            <p className="text-white/30 text-sm mt-1">ROUA TRADING</p>
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="text-xl font-semibold text-center mb-6 text-white/90"
          >
            تسجيل الدخول إلى رحلتك
          </motion.h2>

          {/* Google Button */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            onClick={handleGoogleLogin}
            disabled={loading !== null}
            whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(66, 133, 244, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl
                       bg-white/10 border border-white/20 text-white font-medium
                       hover:bg-white/15 hover:border-white/30
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span>{loading === 'google' ? 'جارٍ الاتصال...' : 'تسجيل الدخول باستخدام Google'}</span>
          </motion.button>

          {/* Passkey Button */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            onClick={handlePasskeyLogin}
            disabled={loading !== null}
            whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(45, 212, 191, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl
                       bg-gradient-to-l from-teal-600 to-teal-500 text-white font-medium
                       hover:from-teal-500 hover:to-teal-400
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200"
          >
            <Fingerprint className="w-5 h-5" />
            <span>{loading === 'passkey' ? 'جارٍ التحقق...' : 'تسجيل الدخول باستخدام Passkey'}</span>
          </motion.button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/30 text-xs">أو</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Guest Access */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            onClick={() => router.push('/dashboard')}
            whileHover={{ scale: 1.01 }}
            className="w-full text-center text-white/40 hover:text-white/60 text-sm transition-colors"
          >
            دخول كضيف ←
          </motion.button>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Motivational Text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="text-center text-white/25 text-xs mt-6 leading-relaxed"
          >
            لا كلمات مرور. لا متاعب. فقط أنت والأسواق.
          </motion.p>
        </motion.div>

        {/* Bottom Link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="text-center mt-6 text-white/20 text-xs"
        >
          <a href="/" className="hover:text-white/40 transition-colors">
            ← العودة إلى الصفحة الرئيسية
          </a>
        </motion.p>
      </div>
    </div>
  )
}
