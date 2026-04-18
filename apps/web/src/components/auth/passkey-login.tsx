'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { signIn } from 'next-auth/react'
import { Fingerprint, Shield, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AuthState = 'idle' | 'registering' | 'verifying' | 'success' | 'error'

interface PasskeyLoginProps {
  onClose: () => void
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

// Google SVG icon component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export function PasskeyLogin({ onClose }: PasskeyLoginProps) {
  const [authState, setAuthState] = useState<AuthState>('idle')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isRegister, setIsRegister] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleLogin = useCallback(async () => {
    setGoogleLoading(true)
    setErrorMessage('')

    try {
      // Use NextAuth's signIn() for proper Google OAuth flow
      // After Google auth, NextAuth redirects to our bridge route
      // which creates a roua_session cookie and redirects to /dashboard
      const result = await signIn('google', {
        callbackUrl: '/api/auth/google/callback',
        redirect: false, // Don't auto-redirect so we can handle errors
      })

      if (result?.error) {
        setErrorMessage(
          result.error === 'AccessDenied'
            ? 'تم رفض الوصول. تحقق من إعدادات Google OAuth.'
            : result.error === 'OAuthSignin'
              ? 'فشل الاتصال بـ Google. تحقق من GOOGLE_CLIENT_ID.'
              : result.error === 'OAuthCallback'
                ? 'فشل التحقق من Google. تحقق من إعدادات OAuth.'
                : `خطأ في تسجيل الدخول: ${result.error}`
        )
        setGoogleLoading(false)
        return
      }

      // If no error and result exists, redirect to the callback bridge
      // which will create roua_session and redirect to /dashboard
      if (result?.ok && result?.url) {
        window.location.href = result.url
        return
      }

      // Fallback: redirect to callback bridge directly
      window.location.href = '/api/auth/google/callback'
    } catch (err: unknown) {
      setGoogleLoading(false)
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع'
      setErrorMessage(message)
    }
  }, [])

  const handleRegister = useCallback(async () => {
    if (!email) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني')
      return
    }

    setAuthState('registering')
    setErrorMessage('')

    try {
      const challengeRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName }),
      })

      if (!challengeRes.ok) {
        const err = await challengeRes.json()
        throw new Error(err.error || 'فشل في إنشاء التحدي')
      }

      const options = await challengeRes.json()

      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('متصفحك لا يدعم WebAuthn. يرجى استخدام متصفح حديث.')
      }

      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: base64urlToUint8Array(options.challenge),
          user: {
            ...options.user,
            id: base64urlToUint8Array(options.user.id),
          },
          excludeCredentials: (options.excludeCredentials || []).map((ec: Record<string, unknown>) => ({
            ...ec,
            id: base64urlToUint8Array(ec.id as string),
          })),
        },
      })

      if (!credential) {
        throw new Error('فشل في إنشاء بيانات الاعتماد')
      }

      setAuthState('verifying')

      const attestationResponse = credential.response as AuthenticatorAttestationResponse

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: {
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            response: {
              clientDataJSON: bufferToBase64url(attestationResponse.clientDataJSON),
              attestationObject: bufferToBase64url(attestationResponse.attestationObject),
            },
            type: credential.type,
          },
          email,
        }),
      })

      if (!verifyRes.ok) {
        throw new Error('فشل في التحقق من بيانات الاعتماد')
      }

      setAuthState('success')
    } catch (err: unknown) {
      setAuthState('error')
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع'
      setErrorMessage(message)
    }
  }, [email, displayName])

  const handleLogin = useCallback(async () => {
    if (!email) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني')
      return
    }

    setAuthState('registering')
    setErrorMessage('')

    try {
      const challengeRes = await fetch('/api/auth/register?email=' + encodeURIComponent(email))

      if (!challengeRes.ok) {
        throw new Error('المستخدم غير موجود. يرجى التسجيل أولاً.')
      }

      const options = await challengeRes.json()

      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('متصفحك لا يدعم WebAuthn')
      }

      const assertion = await navigator.credentials.get({
        publicKey: {
          ...options,
          challenge: base64urlToUint8Array(options.challenge),
          allowCredentials: (options.allowCredentials || []).map((ac: Record<string, unknown>) => ({
            ...ac,
            id: base64urlToUint8Array(ac.id as string),
          })),
        },
      })

      if (!assertion) {
        throw new Error('فشل في المصادقة')
      }

      setAuthState('verifying')

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assertion: {
            id: assertion.id,
            rawId: bufferToBase64url(assertion.rawId),
            response: {
              clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
              authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
              signature: bufferToBase64url(assertionResponse.signature),
            },
            type: assertion.type,
          },
          email,
        }),
      })

      if (!verifyRes.ok) {
        throw new Error('فشل في المصادقة')
      }

      setAuthState('success')
    } catch (err: unknown) {
      setAuthState('error')
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع'
      setErrorMessage(message)
    }
  }, [email])

  const isLoading = authState === 'registering' || authState === 'verifying'

  return (
    <Card className="bg-card border-border shadow-2xl shadow-teal-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
              <Fingerprint className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">
                {isRegister ? 'إنشاء حساب' : 'تسجيل الدخول'}
              </CardTitle>
              <p className="text-xs text-muted-foreground">مصادقة آمنة وسريعة</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <AnimatePresence mode="wait">
          {authState === 'success' ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6"
            >
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-bold text-lg mb-1">تم بنجاح!</p>
              <p className="text-sm text-muted-foreground">
                {isRegister ? 'تم إنشاء حسابك بأمان' : 'مرحبًا بعودتك'}
              </p>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* ── Google Sign-In Button ── */}
              <Button
                className="w-full bg-white hover:bg-gray-100 text-gray-800 font-bold h-11 border border-gray-300 gap-3"
                onClick={handleGoogleLogin}
                disabled={isLoading || googleLoading}
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
                ) : (
                  <GoogleIcon className="w-5 h-5" />
                )}
                <span dir="ltr" className="text-sm">
                  {isRegister ? 'Sign up with Google' : 'Sign in with Google'}
                </span>
              </Button>

              {/* ── Divider ── */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">أو</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* ── Email + Passkey Form ── */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  البريد الإلكتروني
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="bg-background border-border"
                  dir="ltr"
                />
              </div>

              {isRegister && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    الاسم (اختياري)
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="اسمك"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoading}
                    className="bg-background border-border"
                  />
                </div>
              )}

              {authState === 'error' && errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{errorMessage}</p>
                </motion.div>
              )}

              <Button
                className="w-full bg-teal-500 hover:bg-teal-600 text-background font-bold h-11"
                onClick={isRegister ? handleRegister : handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    {authState === 'registering' ? 'جارٍ إنشاء المفتاح...' : 'جارٍ التحقق...'}
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 ml-2" />
                    {isRegister ? 'إنشاء حساب بـ Passkey' : 'تسجيل الدخول بـ Passkey'}
                  </>
                )}
              </Button>

              <div className="text-center">
                <button
                  onClick={() => {
                    setIsRegister(!isRegister)
                    setAuthState('idle')
                    setErrorMessage('')
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  {isRegister ? 'لديك حساب؟ سجّل الدخول' : 'ليس لديك حساب؟ أنشئ واحدًا'}
                </button>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-500/5 border border-teal-500/10">
                <Shield className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Passkeys تستخدم التشفير البيومتري (بصمة/وجه) ولا يمكن سرقتها أو تصيدها.
                  أو سجّل دخولك بحساب Google بسرعة وأمان.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
