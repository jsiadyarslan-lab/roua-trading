'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Briefcase,
  Newspaper,
  Settings,
  LogOut,
  Menu,
  X,
  TrendingUp,
} from 'lucide-react'
import { MarketTicker } from '@/components/dashboard/market-ticker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface User {
  id: string
  email: string
  displayName: string
  tier: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session')
        const data = await res.json()

        if (!data.authenticated) {
          router.push('/')
          return
        }

        setUser(data.user)
      } catch {
        router.push('/')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' })
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <p className="text-muted-foreground">جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  const navItems = [
    { icon: LayoutDashboard, label: 'لوحة القيادة', active: true },
    { icon: BarChart3, label: 'الأسواق', active: false },
    { icon: Brain, label: 'سيمفونية الذكاء', active: false },
    { icon: Briefcase, label: 'المحفظة', active: false },
    { icon: Newspaper, label: 'الأخبار', active: false },
    { icon: Settings, label: 'الإعدادات', active: false },
  ]

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-card border-l border-border transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg">رؤى للتداول</h1>
                <p className="text-xs text-muted-foreground">Roua Trading</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                  item.active
                    ? 'bg-teal-500/10 text-teal-400 font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={
                  user?.tier === 'PREMIUM'
                    ? 'border-amber-500/30 text-amber-400'
                    : user?.tier === 'INSTITUTIONAL'
                    ? 'border-purple-500/30 text-purple-400'
                    : 'border-teal-500/30 text-teal-400'
                }
              >
                {user?.tier === 'FREE' ? 'مجاني' : user?.tier === 'PREMIUM' ? 'متميز' : 'مؤسسي'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-8 w-8 text-muted-foreground hover:text-red-400"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
              <div>
                <h2 className="text-xl font-bold">لوحة القيادة</h2>
                <p className="text-xs text-muted-foreground">
                  مرحبًا، {user?.displayName} — ببصيرة نحو الأسواق
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <div className="w-2 h-2 rounded-full bg-green-400 ml-1.5 animate-pulse" />
                متصل
              </Badge>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-6 space-y-6">
          {/* Stats Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">الأسواق المتابعة</p>
                    <p className="text-2xl font-bold mt-1">7</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-teal-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">نماذج الذكاء النشطة</p>
                    <p className="text-2xl font-bold mt-1">0/6</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">المحفظة</p>
                    <p className="text-2xl font-bold mt-1">$0.00</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">الخطة</p>
                    <p className="text-2xl font-bold mt-1">
                      {user?.tier === 'FREE' ? 'مجاني' : user?.tier || '—'}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Market Ticker */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <MarketTicker symbols={['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'EUR/USD', 'BTC/USDT']} refreshInterval={5000} />
          </motion.div>

          {/* AI Symphony Placeholder */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">سيمفونية الذكاء الاصطناعي</CardTitle>
                    <p className="text-xs text-muted-foreground">6 نماذج ذكاء اصطناعي تعمل بتناغم</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { name: 'Gemini 2.5 Pro', role: 'تحليل إبداعي', color: 'from-blue-400 to-cyan-500' },
                    { name: 'Groq/Llama 3', role: 'سرعة فائقة', color: 'from-green-400 to-emerald-500' },
                    { name: 'GLM-4', role: 'تحليل عربي', color: 'from-teal-400 to-blue-500' },
                    { name: 'Ollama Cloud', role: 'مهام عامة', color: 'from-amber-400 to-orange-500' },
                    { name: 'Claude 4.6', role: 'إشارات وتقارير', color: 'from-purple-400 to-violet-500' },
                    { name: 'Twelve Data', role: 'بيانات السوق', color: 'from-pink-400 to-rose-500' },
                  ].map((model) => (
                    <div
                      key={model.name}
                      className="text-center p-3 rounded-xl bg-background border border-border/50"
                    >
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${model.color} flex items-center justify-center mx-auto mb-2 opacity-40`}>
                        <Brain className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-xs font-medium">{model.name}</p>
                      <p className="text-[10px] text-muted-foreground">{model.role}</p>
                      <Badge variant="outline" className="text-[10px] mt-1 opacity-50">
                        قادم
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
