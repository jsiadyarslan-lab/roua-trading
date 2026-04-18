'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Globe, Brain, Newspaper, ArrowLeft, ChevronDown,
  Fingerprint, Lock, Eye, Zap, BarChart3, TrendingUp,
  CheckCircle2, Clock, Rocket, Sparkles, Key, Cpu
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PasskeyLogin } from '@/components/auth/passkey-login'

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
}

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } }
}

const pillars = [
  {
    icon: Shield,
    title: 'اللامركزية في الحفظ',
    titleEn: 'Non-Custodial',
    color: 'text-teal-400',
    borderColor: 'border-teal-500/30',
    bgColor: 'bg-teal-500/10',
    desc: 'لا نلمس أموالك أبدًا. مفاتيح API تُشفَّر من جانب العميل، ويُرفض أي مفتاح يحتوي صلاحيات سحب فورًا.'
  },
  {
    icon: Globe,
    title: 'الدمج الشامل',
    titleEn: 'Universal Integration',
    color: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/10',
    desc: 'الأسهم والفوركس والعملات الرقمية والسلع والمؤشرات — كلها في لوحة قيادة واحدة موحدة.'
  },
  {
    icon: Brain,
    title: 'سيمفونية الذكاء الاصطناعي',
    titleEn: 'AI Symphony',
    color: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/10',
    desc: 'توزيع ذكي للمهام على 6 نماذج ذكاء اصطناعي متخصصة تعمل في تناغم كامل.'
  },
  {
    icon: Newspaper,
    title: 'غرفة الأخبار الآلية',
    titleEn: 'Autonomous Newsroom',
    color: 'text-green-400',
    borderColor: 'border-green-500/30',
    bgColor: 'bg-green-500/10',
    desc: 'فريق تحرير من الوكلاء الأذكياء ينتج أرشيفًا إخباريًا حيًا ومُحسَّنًا على مدار الساعة.'
  }
]

const aiModels = [
  { name: 'Google Gemini', model: 'gemini-2.5-pro', role: 'العقل المدبر', roleEn: 'Creative Vision', color: 'from-teal-500/20 to-teal-900/20', border: 'border-teal-500/30', icon: Sparkles },
  { name: 'Groq', model: 'Llama 3', role: 'السرعة الصاروخية', roleEn: 'Speed & Sentiment', color: 'from-blue-500/20 to-blue-900/20', border: 'border-blue-500/30', icon: Zap },
  { name: 'GLM-4', model: 'Zhipu AI', role: 'المحلل المالي', roleEn: 'Financial Analysis', color: 'from-amber-500/20 to-amber-900/20', border: 'border-amber-500/30', icon: BarChart3 },
  { name: 'Ollama Cloud', model: 'Multi-model', role: 'الجندي متعدد المهام', roleEn: 'General Tasks', color: 'from-gray-500/20 to-gray-900/20', border: 'border-gray-500/30', icon: Cpu },
  { name: 'Amazon Bedrock', model: 'Claude 4.6', role: 'المستشار الخاص', roleEn: 'Signal Generation', color: 'from-purple-500/20 to-purple-900/20', border: 'border-purple-500/30', icon: TrendingUp },
  { name: 'Twelve Data', model: 'Market Data', role: 'مصدر البيانات', roleEn: 'Primary Data Source', color: 'from-green-500/20 to-green-900/20', border: 'border-green-500/30', icon: Key },
]

const features = [
  {
    icon: Brain,
    title: 'المُحلل متعدد اللغات',
    desc: 'يفهم العامية العربية والمصطلحات المالية المحلية بدقة. لا حاجة للكتابة بالفصحى — "رؤى" تفهمك كما تتحدث.',
    badge: 'Polyglot Analyst'
  },
  {
    icon: TrendingUp,
    title: 'إشارات رؤى',
    desc: 'توصيات تداول قابلة للتنفيذ مع شرح مبسط. تُصاغ كـ"تحليل فني" وليس "نصيحة استثمارية" مع توقيع إلكتروني.',
    badge: 'Roua Signals'
  },
  {
    icon: Newspaper,
    title: 'رادار الأخبار الموحد',
    desc: 'تدفق حي يدمج أخبار العالم مع تحليل "رؤى" الحصري. كل خبر يُحلَّل فورًا من حيث الأثر على المحفظة.',
    badge: 'News Radar'
  },
  {
    icon: Shield,
    title: 'ملاذ المحفظة',
    desc: 'أداة استباقية لإدارة المخاطر عبر جميع الأصول والمنصات. تنبيهات ذكية عند تجاوز حدود المخاطرة.',
    badge: 'Portfolio Sanctuary'
  },
  {
    icon: Eye,
    title: 'المختبر الذكي',
    desc: 'Backtesting متكامل وباني بوتات تداول بدون كود. اختبر استراتيجياتك قبل المخاطرة بأموال حقيقية.',
    badge: 'Smart Lab'
  }
]

const roadmap = [
  { phase: 1, title: 'الأساس', months: '1-3', color: 'bg-teal-500', items: ['إعداد Monorepo', 'Next.js 15 Frontend', 'NestJS Microservices', 'WebAuthn + AES-256-GCM', 'Twelve Data Integration'] },
  { phase: 2, title: 'الذكاء', months: '4-6', color: 'bg-blue-500', items: ['دمج 6 نماذج AI', 'AI Orchestrator', 'نظام RAG + pgvector', 'معالجة عربية متقدمة', 'المختبر الذكي'] },
  { phase: 3, title: 'الثورة', months: '7-9', color: 'bg-amber-500', items: ['إشارات رؤى الموقعة', 'ملاذ المحفظة', 'غرفة الأخبار الآلية', 'CCXT +100 منصة', 'تصلب أمان متقدم'] },
  { phase: 4, title: 'الإطلاق', months: '10-12', color: 'bg-green-500', items: ['Beta Testing', 'تحسين الأداء', 'مراجعة قانونية', 'إطلاق الاشتراكات', 'نشر إنتاجي كامل'] },
]

export default function Home() {
  const [showAuth, setShowAuth] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
              <span className="text-sm font-black text-white">ر</span>
            </div>
            <span className="text-lg font-bold">رؤى</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">Roua Trading</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-teal-400 border-teal-500/30 text-xs">
              <Lock className="w-3 h-3 ml-1" />
              Zero-Trust
            </Badge>
            <Button
              size="sm"
              className="bg-teal-500 hover:bg-teal-600 text-background font-bold"
              onClick={() => setShowAuth(!showAuth)}
            >
              <Fingerprint className="w-4 h-4 ml-1" />
              ابدأ الآن
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Auth Modal ── */}
      <AnimatePresence>
        {showAuth && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={() => setShowAuth(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <PasskeyLogin onClose={() => setShowAuth(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero Section ── */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-teal-500/10 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div {...fadeInUp}>
            <Badge variant="outline" className="mb-6 border-teal-500/30 text-teal-400 px-4 py-1.5">
              <Sparkles className="w-3.5 h-3.5 ml-1.5" />
              Financial Intelligence Layer
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl sm:text-7xl font-black mb-4 leading-tight"
          >
            <span className="bg-gradient-to-l from-teal-300 via-teal-400 to-blue-400 bg-clip-text text-transparent">
              رؤى
            </span>
            <span className="text-foreground"> للتداول</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-xl sm:text-2xl text-muted-foreground mb-2 font-light"
            dir="ltr"
          >
            &ldquo;Vision into Markets&rdquo;
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-lg text-muted-foreground mb-10 font-light"
          >
            ببصيرة نحو الأسواق
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-base text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            طبقة ذكاء مالي تربط المتداول بجميع أسواق العالم عبر واجهة واحدة آمنة.
            المنصة الأولى التي تدمج الذكاء الجماعي لستة نماذج ذكاء اصطناعي في سيمفونية واحدة،
            لتقديم تحليلات ليست فقط دقيقة، بل خاصة وآمنة ومتحدثة بالعربية الأصيلة.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-wrap justify-center gap-4"
          >
            <Button
              size="lg"
              className="bg-teal-500 hover:bg-teal-600 text-background font-bold text-lg px-8 h-12"
              onClick={() => setShowAuth(true)}
            >
              <Fingerprint className="w-5 h-5 ml-2" />
              ابدأ الآن
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border hover:bg-secondary font-bold text-lg px-8 h-12"
              onClick={() => document.getElementById('pillars')?.scrollIntoView({ behavior: 'smooth' })}
            >
              تعرف على المزيد
              <ChevronDown className="w-5 h-5 mr-2" />
            </Button>
          </motion.div>

          {/* Quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="grid grid-cols-3 gap-6 mt-16 max-w-lg mx-auto"
          >
            {[
              { value: '6', label: 'نماذج AI' },
              { value: '100+', label: 'منصة تداول' },
              { value: '0', label: 'صلاحيات سحب' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-black text-teal-400">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Pillars Section ── */}
      <section id="pillars" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-teal-500/30 text-teal-400">
              الركائز الثورية
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">الأعمدة الأربع لمنصة رؤى</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              كل ركيزة مصممة لتحويل تجربة التداول من عشوائية إلى منهجية ذكية
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pillars.map((pillar, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <Card className={`bg-card/50 backdrop-blur border ${pillar.borderColor} hover:border-opacity-60 transition-all duration-300 h-full`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${pillar.bgColor} flex items-center justify-center`}>
                        <pillar.icon className={`w-5 h-5 ${pillar.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold">{pillar.title}</CardTitle>
                        <span className="text-xs text-muted-foreground" dir="ltr">{pillar.titleEn}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">{pillar.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Symphony Section ── */}
      <section className="py-20 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-blue-500/30 text-blue-400">
              AI Symphony
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">سيمفونية الذكاء الاصطناعي</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              ستة نماذج متخصصة تعمل في تناغم — كل نموذج يؤدي دوره بدقة متناهية
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {aiModels.map((model, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <Card className={`bg-gradient-to-br ${model.color} border ${model.border} hover:scale-[1.02] transition-transform duration-200`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <model.icon className="w-6 h-6 text-foreground/70" />
                      <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground" dir="ltr">
                        {model.model}
                      </Badge>
                    </div>
                    <h3 className="font-bold text-base mb-1" dir="ltr">{model.name}</h3>
                    <p className="text-sm text-muted-foreground">{model.role}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1" dir="ltr">{model.roleEn}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Data flow visualization */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-12 text-center"
          >
            <Card className="bg-card/50 border-border max-w-3xl mx-auto">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-4 font-bold">مسار تدفق البيانات</p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <Badge className="bg-green-500/20 text-green-400 border-0">Twelve Data</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge className="bg-blue-500/20 text-blue-400 border-0">Groq</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge className="bg-amber-500/20 text-amber-400 border-0">GLM-4</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge className="bg-teal-500/20 text-teal-400 border-0">Gemini</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge className="bg-purple-500/20 text-purple-400 border-0">Bedrock</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge className="bg-foreground/10 text-foreground border-0">إشارة موقعة</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-amber-500/30 text-amber-400">
              الميزات الثورية
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">ميزات تُعيد تعريف التداول</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              أدوات لم تكن متاحة من قبل للمتداول العربي
            </p>
          </motion.div>

          <div className="space-y-4">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card
                  className="bg-card/50 border-border hover:border-teal-500/30 transition-all duration-300 cursor-pointer"
                  onClick={() => setExpandedSection(expandedSection === feature.badge ? null : feature.badge)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                        <feature.icon className="w-5 h-5 text-teal-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-bold text-base">{feature.title}</h3>
                          <Badge variant="outline" className="text-[10px] text-teal-400 border-teal-500/30" dir="ltr">
                            {feature.badge}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Security Section ── */}
      <section className="py-20 px-6 bg-card/30">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-red-500/30 text-red-400">
              Zero-Trust Security
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">الأمان الصفري</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              لا ثقة افتراضية — كل طلب يجب أن يُثبت شرعيته
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Fingerprint, title: 'WebAuthn (Passkeys)', desc: 'مصادحة حصرية بدون كلمات مرور. لا تصيد احتيالي ممكن.' },
              { icon: Lock, title: 'AES-256-GCM', desc: 'تشفير مزدوج (عميل + خادم) لمفاتيح API. تشفير من جانب العميل قبل الإرسال.' },
              { icon: Shield, title: 'رفض صلاحيات السحب', desc: 'أي مفتاح API يحتوي صلاحيات Withdraw أو Transfer يُرفض فورًا.' },
              { icon: Eye, title: 'تسجيل شامل', desc: 'كل نقرة وكل استدعاء API وكل تغيير يُسجَّل في نظام Audit Logging.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card className="bg-card/50 border-border h-full">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <item.icon className="w-5 h-5 text-red-400" />
                      <h3 className="font-bold text-sm" dir="ltr">{item.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Warning banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8"
          >
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-5 flex items-start gap-3">
                <Shield className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-sm text-red-400 mb-1">قاعدة حاسمة: اللامركزية في الحفظ</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    منصة &quot;رؤى&quot; لا تلمس أموال المستخدم أبدًا. عدم القدرة على سحب الأموال يعني عدم القدرة على فقدانها. هذه القاعدة لا استثناء لها ولا تسوية فيها.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* ── Roadmap Section ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-green-500/30 text-green-400">
              Roadmap
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-black mb-4">خارطة الطريق إلى الثورة</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              أربع مراحل على مدى 12 شهرًا — من الأساس إلى الإطلاق
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {roadmap.map((phase, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.12 }}
              >
                <Card className="bg-card/50 border-border h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${phase.color} flex items-center justify-center`}>
                        <span className="text-sm font-black text-background">{phase.phase}</span>
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold">{phase.title}</CardTitle>
                        <span className="text-xs text-muted-foreground">الأشهر {phase.months}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {phase.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 mt-0.5 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-20 px-6 bg-card/30">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div {...fadeInUp}>
            <h2 className="text-3xl sm:text-4xl font-black mb-6">
              جاهز للبدء بـ
              <span className="bg-gradient-to-l from-teal-300 to-blue-400 bg-clip-text text-transparent"> بصيرة</span>
              ؟
            </h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto leading-relaxed">
              انضم إلى المنصة الأولى التي تدمج الذكاء الاصطناعي المتعدد مع الأمان الصفري — بلغتك العربية الأصيلة.
            </p>
            <Button
              size="lg"
              className="bg-teal-500 hover:bg-teal-600 text-background font-bold text-lg px-10 h-14"
              onClick={() => setShowAuth(true)}
            >
              <Rocket className="w-5 h-5 ml-2" />
              ابدأ مجانًا
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              سجّل بحساب Google أو Passkeys — بدون كلمات مرور
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
              <span className="text-[10px] font-black text-white">ر</span>
            </div>
            <span className="text-sm font-bold">رؤى للتداول</span>
            <span className="text-xs text-muted-foreground" dir="ltr">RouaTrading.ai</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Roua Trading — ببصيرة نحو الأسواق
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground" dir="ltr">
            <span className="hover:text-foreground cursor-pointer transition-colors">Privacy</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">Terms</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">Security</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
