'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  // Convert to standard base64 first, then convert to base64url
  // WebAuthn/@simplewebauthn expects base64url encoding (no +, /, or = padding)
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Decode base64url string to Uint8Array.
// Browser's atob() only supports standard base64 (uses + and /),
// but WebAuthn uses base64url encoding (uses - and _).
// We must convert base64url → base64 before decoding.
function base64urlToUint8Array(base64url: string): Uint8Array {
  // Convert base64url to standard base64
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  // Pad with '=' to make length a multiple of 4
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

export function PasskeyLogin({ onClose }: PasskeyLoginProps) {
  const [authState, setAuthState] = useState<AuthState>('idle')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isRegister, setIsRegister] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

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
              <p className="text-xs text-muted-foreground">مصادقة آمنة عبر Passkeys</p>
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
                  لا نستخدم كلمات مرور أبدًا. Passkeys تستخدم التشفير البيومتري (بصمة/وجه)
                  ولا يمكن سرقتها أو تصيدها.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
