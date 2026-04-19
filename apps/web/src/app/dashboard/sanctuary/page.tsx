'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  BarChart3,
  Activity,
  PieChart,
  Target,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PositionDetail {
  symbol: string
  exchange: string
  quantity: number
  currentPrice: number
  value: number
  weight: number
  change24h: number
  assetType: string
}

interface RiskMetrics {
  concentrationRisk: number
  diversificationScore: number
  largestPositionWeight: number
  positionCount: number
  varEstimate: number
  volatilityEstimate: number
}

interface RiskReport {
  summary: string
  riskScore: number
  totalValue: number
  currency: string
  positions: PositionDetail[]
  metrics: RiskMetrics
  recommendations: string[]
  aiAnalysis: string
  analyzedAt: string
}

export default function SanctuaryPage() {
  const router = useRouter()
  const [report, setReport] = useState<RiskReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  // Check auth
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session')
        const data = await res.json()
        if (!data.authenticated) {
          router.push('/')
        }
      } catch {
        router.push('/')
      }
    }
    checkAuth()
  }, [router])

  // Analyze portfolio
  const analyzePortfolio = async () => {
    setAnalyzing(true)
    setError('')

    try {
      const res = await fetch('/api/portfolio/sanctuary')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setReport(data.data)
        }
      } else {
        const data = await res.json()
        throw new Error(data.error || 'فشل في تحليل المحفظة')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    analyzePortfolio()
  }, [])

  const getRiskLevel = (score: number) => {
    if (score < 30) return { label: 'منخفض', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' }
    if (score < 60) return { label: 'متوسط', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' }
    return { label: 'مرتفع', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' }
  }

  const getScoreColor = (score: number, inverted = false) => {
    if (inverted) {
      // Higher = better (like diversification)
      if (score >= 70) return 'text-green-400'
      if (score >= 40) return 'text-yellow-400'
      return 'text-red-400'
    }
    // Higher = worse (like concentration)
    if (score < 30) return 'text-green-400'
    if (score < 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-muted-foreground mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground mt-3">جارٍ تحليل المحفظة...</p>
        </div>
      </div>
    )
  }

  const riskLevel = report ? getRiskLevel(report.riskScore) : null

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">ملاذ المحفظة</h1>
              <p className="text-sm text-muted-foreground">
                تحليل مخاطر شامل مدعوم بالذكاء الاصطناعي
              </p>
            </div>
          </div>
          <Button
            onClick={analyzePortfolio}
            disabled={analyzing}
            className="bg-amber-500 hover:bg-amber-600 text-background"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جارٍ التحليل...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 ml-2" />
                إعادة التحليل
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {report && (
          <>
            {/* Risk Score Overview */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className={`bg-card ${riskLevel?.border || 'border-border'} border-l-4`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">مستوى المخاطر</p>
                      <div className="flex items-center gap-3">
                        <span className={`text-3xl font-bold ${riskLevel?.color || ''}`}>
                          {report.riskScore}
                        </span>
                        <span className="text-lg text-muted-foreground">/100</span>
                        <Badge className={`${riskLevel?.bg || ''} ${riskLevel?.color || ''} border-0`}>
                          {riskLevel?.label || '—'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{report.summary}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">القيمة الإجمالية</p>
                      <p className="text-2xl font-bold" dir="ltr">{formatCurrency(report.totalValue)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {report.positions.length} مركز
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Risk Metrics Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-red-400" />
                    <p className="text-xs text-muted-foreground">مخاطر التركيز</p>
                  </div>
                  <p className={`text-2xl font-bold ${getScoreColor(report.metrics.concentrationRisk)}`}>
                    {report.metrics.concentrationRisk}
                    <span className="text-sm text-muted-foreground">/100</span>
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <PieChart className="w-4 h-4 text-green-400" />
                    <p className="text-xs text-muted-foreground">درجة التنويع</p>
                  </div>
                  <p className={`text-2xl font-bold ${getScoreColor(report.metrics.diversificationScore, true)}`}>
                    {report.metrics.diversificationScore}
                    <span className="text-sm text-muted-foreground">/100</span>
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    <p className="text-xs text-muted-foreground">VaR (95%)</p>
                  </div>
                  <p className="text-2xl font-bold text-amber-400" dir="ltr">
                    {formatCurrency(report.metrics.varEstimate)}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <p className="text-xs text-muted-foreground">التقلب</p>
                  </div>
                  <p className={`text-2xl font-bold ${getScoreColor(report.metrics.volatilityEstimate * 2)}`}>
                    {report.metrics.volatilityEstimate}%
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Positions */}
            {report.positions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      المراكز
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {report.positions.map((pos) => (
                        <div
                          key={`${pos.symbol}-${pos.exchange}`}
                          className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                              {pos.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-medium text-sm" dir="ltr">{pos.symbol}</p>
                              <p className="text-[10px] text-muted-foreground">{pos.exchange}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">القيمة</p>
                              <p dir="ltr">{formatCurrency(pos.value)}</p>
                            </div>
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">الوزن</p>
                              <p className={pos.weight > 20 ? 'text-red-400 font-medium' : ''}>
                                {pos.weight.toFixed(1)}%
                              </p>
                            </div>
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">24س</p>
                              <p className={pos.change24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Recommendations */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    التوصيات
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {report.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border"
                      >
                        <Info className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-muted-foreground leading-relaxed">{rec}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* AI Analysis */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    تحليل الذكاء الاصطناعي
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/10">
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {report.aiAnalysis}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}

        {!report && !loading && (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <p className="font-medium mb-1">لا توجد بيانات محفظة</p>
              <p className="text-sm text-muted-foreground mb-4">
                اربط حساب البورصة الخاص بك أولاً لتفعيل تحليل المخاطر
              </p>
              <Button
                onClick={() => router.push('/dashboard/settings/exchange')}
                className="bg-amber-500 hover:bg-amber-600 text-background"
              >
                ربط حساب بورصة
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Disclaimer */}
        <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              تحليل ملاذ المحفظة لأغراض تعليمية فقط وليس نصيحة استثمارية. لا تلمس رؤى أموالك أبداً — نحن نقرأ فقط.
            </p>
          </div>
        </div>

        {/* Back */}
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard')}
          className="text-muted-foreground"
        >
          <ArrowRight className="w-4 h-4 ml-2" />
          العودة للوحة القيادة
        </Button>
      </div>
    </div>
  )
}
