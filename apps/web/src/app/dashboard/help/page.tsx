'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  HelpCircle, Search, BookOpen, Brain, ShieldCheck, TrendingUp,
  ChevronDown, Mail, MessageSquare, FileText, Send, Star,
  CheckCircle2, AlertCircle, Clock, Users, Lock, CreditCard,
  Zap, Globe, RefreshCw, ExternalLink, Sparkles, X, Link2, Bell, Eye
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

/* ── Design Tokens (canonical + local extensions) ── */
const T = { ...SharedT, pink: '#f472b6', text4: '#475569' }

/* ── FAQ Data ── */
interface FAQItem {
  id: string
  question: string
  answer: string
}

interface FAQCategory {
  id: string
  title: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  items: FAQItem[]
}

const faqCategories: FAQCategory[] = [
  {
    id: 'basics',
    title: 'الأساسيات',
    icon: <BookOpen size={18} />,
    iconColor: T.cyan,
    iconBg: `${T.cyan}14`,
    items: [
      {
        id: 'b1',
        question: 'ما هي منصة رؤى وكيف تعمل؟',
        answer: 'منصة رؤى هي منصة ربط ومتابعة حسابات تداول ذكية تربط حساباتك في البورصات المختلفة (مثل Binance وAlpaca) عبر مفاتيح API آمنة لمراقبة وتحليل أداء محافظك. المنصة لا تنفّذ الصفقات مباشرة بل تتابع حساباتك المربوطة وتوفر تحليلاً ذكياً اصطناعياً شاملاً باستخدام نماذج AI متعددة مثل Gemini وGroq وGLM-4. توفر المنصة رؤى تحليلية متقدمة، إشارات ذكية، تحليل مخاطر، وتنبيهات فورية على حركة حساباتك كل ذلك في واجهة عربية سهلة الاستخدام.',
      },
      {
        id: 'b2',
        question: 'كيف أنشئ حساباً على منصة رؤى؟',
        answer: 'يمكنك إنشاء حساب مجاناً خلال دقائق معدودة عبر زيارة صفحة التسجيل وإدخال بريدك الإلكتروني وكلمة مرور قوية. بعد التسجيل، ستصلك رسالة تأكيد على بريدك الإلكتروني لتفعيل حسابك. يمكنك أيضاً التسجيل بسرعة عبر حساب Google الخاص بك. بعد التفعيل، يمكنك ربط بورصتك المفضلة مثل Binance أو Alpaca عبر مفاتيح API والبدء في متابعة وتحليل أداء محفظتك فوراً.',
      },
      {
        id: 'b3',
        question: 'ما هي خطط الاشتراك المتاحة والفرق بينها؟',
        answer: 'نوفر أربع خطط اشتراك: المجانية (FREE) التي تمنحك وصولاً محدوداً للأدوات الأساسية مع إمكانية ربط حساب بورصة واحد ووضع العرض التجريبي، والاحترافية (PRO) التي تتيح ربط حتى 3 حسابات بورصة مع الإشارات الذكية والتحليل المتقدم، والبريميوم (PREMIUM) التي تضيف الذكاء الاصطناعي المتقدم وربط حتى 10 حسابات مع متابعة أداء الحسابات، والمؤسسية (INSTITUTIONAL) المخصصة للمحترفين مع ربط عدد غير محدود من الحسابات ووصول كامل لجميع الميزات. كل خطة تختلف في عدد الحسابات المربوطة، عدد الإشارات اليومية، نماذج AI المتاحة، ومستوى التحليل المقدم.',
      },
      {
        id: 'b4',
        question: 'هل يمكنني استخدام المنصة دون ربط بورصة؟',
        answer: 'نعم، بالتأكيد! يمكنك استخدام منصة رؤى دون ربط أي بورصة عبر وضع العرض التجريبي (Demo Mode). يتيح لك هذا الوضع تجربة جميع أدوات التحليل والذكاء الاصطناعي ببيانات سوق افتراضية، مما يساعدك على تعلم المنصة واستكشاف ميزاتها قبل ربط حسابك الحقيقي. عندما تكون مستعداً، يمكنك ربط بورصتك بسهولة عبر صفحة الإعدادات مع الحفاظ على أعلى معايير الأمان.',
      },
    ],
  },
  {
    id: 'trading',
    title: 'متابعة الحسابات',
    icon: <Link2 size={18} />,
    iconColor: T.green,
    iconBg: `${T.green}14`,
    items: [
      {
        id: 't1',
        question: 'كيف أربط حساب بورصة جديد؟',
        answer: 'لربط حساب بورصة جديد، انتقل إلى صفحة الإعدادات واختر قسم "الحسابات المربوطة". اضغط على زر "ربط حساب جديد" واختر البورصة التي تريد ربطها (مثل Binance أو Alpaca). ستحتاج إلى إنشاء مفتاح API من حسابك في البورصة مع صلاحيات القراءة والتداول فقط — تأكد من عدم تفعيل صلاحية السحب. أدخل مفتاح API والسر الخاص في المنصة وسيتم التحقق من الاتصال تلقائياً. بعد الربط الناجح، ستبدأ المنصة فوراً في متابعة رصيدك ومراكزك المفتوحة.',
      },
      {
        id: 't2',
        question: 'كيف أتابع أداء حساباتي المربوطة؟',
        answer: 'بعد ربط حساباتك، توفر المنصة لوحة متابعة شاملة تعرض جميع حساباتك المربوطة في مكان واحد. يمكنك مشاهدة الرصيد الإجمالي، الربح والخسارة، المراكز المفتوحة، وتوزيع المحفظة عبر جميع البورصات. تتوفر رسوم بيانية تفاعلية لتتبع أداء محفظتك عبر فترات زمنية مختلفة (يومي، أسبوعي، شهري). كما يمكنك مقارنة أداء حساباتك المربوطة في بورصات مختلفة وتحليل توزيع أصولك بشكل مرئي واضح.',
      },
      {
        id: 't3',
        question: 'ما هي صلاحيات API المطلوبة لربط حسابي؟',
        answer: 'لربط حسابك نحتاج فقط إلى صلاحية القراءة (Read) لمراقبة رصيدك ومراكزك المفتوحة. صلاحية التداول (Trade/Spot Trading) اختيارية وتُستخدم فقط إذا فعّلت ميزة تنفيذ الإشارات تلقائياً عبر حسابك المربوط. الأهم من ذلك، نحن لا نطلب أبداً صلاحية السحب (Withdraw) — ويرفض النظام تلقائياً أي مفتاح يتضمن هذه الصلاحية. ننصح بإنشاء مفتاح API مخصص لرؤى فقط مع أقل الصلاحيات الممكنة، وتقييد المفتاح بعنوان IP الخاص بنا إذا كانت البورصة تدعم ذلك.',
      },
      {
        id: 't4',
        question: 'كيف أحصل على تنبيهات عن حركة حساباتي؟',
        answer: 'توفر المنصة نظام تنبيهات ذكي شامل يمكنك تخصيصه بالكامل. يمكنك إعداد تنبيهات لحركات السعر، تغيرات الرصيد، فتح أو إغلاق مراكز، وتحقيق أهداف ربح أو خسارة محددة. تتوفر التنبيهات عبر عدة قنوات: إشعارات داخل المنصة، بريد إلكتروني، وتنبيهات المتصفح. يمكنك أيضاً تفعيل تنبيهات AI التي تنبهك عند رصد أنماط سوقية غير معتادة أو فرص تداول محتملة على حساباتك المربوطة. إدارة التنبيهات متاحة من صفحة الإعدادات قسم "الإشعارات".',
      },
    ],
  },
  {
    id: 'ai',
    title: 'الذكاء الاصطناعي',
    icon: <Brain size={18} />,
    iconColor: T.purple,
    iconBg: `${T.purple}14`,
    items: [
      {
        id: 'a1',
        question: 'كيف يعمل مجلس الذكاء الاصطناعي (AI Council)؟',
        answer: 'مجلس AI هو ميزة فريدة تجمع تحليلات عدة نماذج ذكاء اصطناعي مستقلة مثل Gemini وGroq وGLM-4 وHuggingFace وOllama وBedrock. كل نموذج يحلل الأصل المالي بشكل مستقل ويقدم توصيته (شراء، بيع، انتظار) مع مستوى الثقة والأسباب. ثم تقوم المنصة بحساب توصية إجماعية مبنية على وزن ثقة كل نموذج. هذا النهج المتعدد النماذج يقلل من تحيز أي نموذج واحد ويزيد من دقة التوصيات بشكل ملحوظ مقارنة بالاعتماد على نموذج واحد فقط.',
      },
      {
        id: 'a2',
        question: 'ما هي الإشارات الذكية وكيف أستخدمها؟',
        answer: 'الإشارات الذكية هي توصيات تداول مبنية على تحليل AI شامل يجمع بين المؤشرات الفنية (RSI, EMA, MACD) وتحليل المشاعر السوقية والأنماط السعرية. كل إشارة تتضمن اتجاه الصفقة (شراء/بيع)، مستوى الثقة، نقطة الدخول المقترحة، وقف الخسارة، والهدف. يمكنك تفعيل الإشعارات الفورية لتلقي الإشارات فوراً، أو مراجعتها في صفحة الإشارات. الإشارات عالية الثقة (أعلى من 80%) مميزة بشارة خاصة ويمكن تنفيذها مباشرة بنقرة واحدة إذا كنت تملك صلاحية التداول.',
      },
      {
        id: 'a3',
        question: 'هل يمكنني تفعيل تنفيذ الإشارات تلقائياً؟',
        answer: 'نعم، يمكنك تفعيل تنفيذ الإشارات تلقائياً من صفحة إعدادات الذكاء الاصطناعي إذا كنت مشتركاً في خطة PRO أو أعلى وفعّلت صلاحية التداول في مفتاح API. يتيح لك ذلك تعيين قواعد محددة مثل مستوى الثقة الأدنى لتنفيذ الصفقات تلقائياً، الحد الأقصى لحجم المركز، وحد الخسارة اليومي. المهم أن الصفقات تُنفذ عبر حساب البورصة المربوط الخاص بك مباشرة — المنصة لا تحتفظ بأموالك أبداً — نحن نربط حساباتك فقط ولا نعمل كوسيط مالي. ننصح بشدة بالبدء بمراقبة توصيات AI أولاً لفهم أسلوبها قبل تفعيل التنفيذ التلقائي.',
      },
      {
        id: 'a4',
        question: 'كيف يعمل ماسح السوق الذكي (Smart Scanner)؟',
        answer: 'ماسح السوق الذكي يراقب مئات الأزواج المالية في الوقت الحقيقي ويحللها باستخدام خوارزميات AI لتحديد الفرص الواعدة. يقوم الماسح بتقييم كل زوج بناءً على عدة عوامل تشمل: قوة الاتجاه، حجم التداول، مؤشرات الزخم، أنماط الاختراق، وتحليل المشاعر. ثم يمنح كل زوج درجة ذكاء (Smart Score) من 0 إلى 100 وترتيبها حسب الأهمية. يمكنك تخصيص فلاتر الماسح حسب تفضيلاتك مثل الحد الأدنى للدرجة، الأطر الزمنية، والقطاعات المستهدفة.',
      },
    ],
  },
  {
    id: 'security',
    title: 'الأمان والخصوصية',
    icon: <ShieldCheck size={18} />,
    iconColor: T.green,
    iconBg: `${T.green}14`,
    items: [
      {
        id: 's1',
        question: 'كيف تحمي منصة رؤى مفاتيح API الخاصة بي؟',
        answer: 'نأخذ أمان مفاتيح API على محمل الجد القصوى. يتم تشفير جميع المفاتيح باستخدام خوارزمية AES-256-GCM وهي من أقوى خوارزميات التشفير المعتمدة عالمياً. المفاتيح تُخزن مشفرة في قاعدة بيانات معزولة ولا يمكن الوصول إليها إلا من خلال خدمات التنفيذ الموثوقة. نحن نرفض تلقائياً أي مفتاح يملك صلاحيات السحب (Withdraw) لضمان عدم قدرة أي طرف على سحب أموالك. بالإضافة إلى ذلك، يتم تدقيق جميع عمليات الوصول للمفاتيح وتسجيلها في سجلات أمان مراقبة.',
      },
      {
        id: 's2',
        question: 'هل يمكن للمنصة سحب أموالي من البورصة؟',
        answer: 'لا، أبداً! منصة رؤى لا تملك ولا تطلب صلاحيات سحب الأموال من حسابك في البورصة. نحن نستخدم فقط مفاتيح API ذات صلاحيات القراءة والتداول المحدودة، ولا نقبل أبداً مفاتيح تتضمن صلاحيات السحب أو التحويل. هذا يعني أن أموالك تبقى آمنة في حسابك على البورصة ولا يمكن لشخص آخر سحبها حتى لو تم اختراق حسابك على رؤى. نوصي دائماً بإنشاء مفاتيح API مخصصة لرؤى فقط مع أقل الصلاحيات الممكنة.',
      },
      {
        id: 's3',
        question: 'كيف أحمي حسابي من الاختراق؟',
        answer: 'نوفر عدة طبقات حماية لحسابك: أولاً، المصادقة الثنائية (2FA) عبر تطبيق مصادقة أو رسائل SMS التي تضيف طبقة أمان إضافية عند تسجيل الدخول. ثانياً، نظام اكتشاف تسجيلات الدخول المشبوهة الذي يتنبهك عند محاولة الوصول من جهاز أو موقع جديد. ثالثاً، يمكنك مراقبة وإدارة جلساتك النشطة وإنهاء أي جلسة مشبوهة فوراً. رابعاً، التشفير الشامل للبيانات الحساسة والتحقق من هوية الجلسة بشكل دوري كل 15 دقيقة. ننصح باستخدام كلمة مرور فريدة وقوية وتفعيل 2FA فوراً.',
      },
      {
        id: 's4',
        question: 'ما هي سياسة الخصوصية وكيف تُستخدم بياناتي؟',
        answer: 'نلتزم بأعلى معايير الخصوصية وحماية البيانات. بياناتك الشخصية مشفرة ولا تُشارك مع أي طرف ثالث بدون موافقتك الصريحة. نستخدم بيانات التداول المجمعة وغير المحددة هوية لتحسين أداء نماذج AI لدينا فقط، ولا نربطها بحسابك الشخصي أبداً. يمكنك تصدير جميع بياناتك في أي وقت من صفحة الإعدادات، كما يمكنك طلب حذف بياناتك بالكامل. نحن نخضع لمراجعات أمنية دورية ونلتزم بلوائح حماية البيانات الدولية لضمان سلامة معلوماتك.',
      },
    ],
  },
  {
    id: 'billing',
    title: 'الاشتراكات والمدفوعات',
    icon: <CreditCard size={18} />,
    iconColor: T.amber,
    iconBg: `${T.amber}14`,
    items: [
      {
        id: 'p1',
        question: 'كيف أقوم بترقية خطتي أو تغييرها؟',
        answer: 'يمكنك ترقية خطتك بسهولة من صفحة الإعدادات قسم الاشتراك. اختر الخطة الجديدة وسيتم احتساب الفرق في السعر بشكل تناسبي بناءً على المدة المتبقية من اشتراكك الحالي. الترقية تتفعل فوراً وتحصل على جميع الميزات الجديدة مباشرة. أما خفض الخطة فيتفعل في نهاية دورة الاشتراك الحالية لضمان استفادتك الكاملة من المدة المدفوعة. نقبل الدفع عبر بطاقات الائتمان والخصم، والتحويل المصرفي، والعملات الرقمية الأساسية.',
      },
      {
        id: 'p2',
        question: 'هل يمكنني إلغاء اشتراكي في أي وقت؟',
        answer: 'نعم، يمكنك إلغاء اشتراكك في أي وقت دون أي رسوم إضافية أو عقوبات. عند الإلغاء، يظل حسابك مفاعلاً بميزات الخطة الحالية حتى نهاية دورة الاشتراك المدفوعة. بعد انتهاء الدورة، يتم تحويل حسابك تلقائياً إلى الخطة المجانية مع الاحتفاظ بجميع بياناتك وسجل متابعة حساباتك. يمكنك إعادة تفعيل الاشتراك في أي وقت مستقبلاً واستعادة جميع ميزاتك السابقة. لا نقوم بأي رسوم مخفية أو تجديد تلقائي بدون موافقتك المسبقة.',
      },
      {
        id: 'p3',
        question: 'ما هي سياسة الاسترداد والاسترجاع؟',
        answer: 'نوفر ضمان استرداد كامل خلال 14 يوماً من تاريخ الشراء إذا لم تكن راضياً عن الخدمة. يشمل ذلك جميع خطط الاشتراك دون استثناء. لطلب الاسترداد، تواصل مع فريق الدعم عبر البريد الإلكتروني أو الدردشة المباشرة مع ذكر سبب الطلب. يتم معالجة طلبات الاسترداد خلال 3-5 أيام عمل وتُعاد المبالغ عبر نفس طريقة الدفع الأصلية. نحن نؤمن بأن راحتك هي أولويتنا ونريدك أن تكون واثقاً تماماً من استثمارك في منصة رؤى.',
      },
    ],
  },
]

/* ── Quick Links Data ── */
const quickLinks = [
  {
    id: 'beginner',
    title: 'دليل المبتدئين',
    description: 'ابدأ رحلتك مع منصة رؤى خطوة بخطوة من التسجيل حتى ربط أول حساب بورصة',
    icon: <BookOpen size={22} />,
    color: T.cyan,
    bg: `${T.cyan}14`,
  },
  {
    id: 'ai-guide',
    title: 'دليل AI',
    description: 'تعرّف على ميزات الذكاء الاصطناعي المتاحة وكيفية الاستفادة القصوى منها',
    icon: <Brain size={22} />,
    color: T.purple,
    bg: `${T.purple}14`,
  },
  {
    id: 'security',
    title: 'سياسة الأمان',
    description: 'تعرف على إجراءات الحماية والتشفير التي نطبقها لحماية بياناتك وأموالك',
    icon: <ShieldCheck size={22} />,
    color: T.green,
    bg: `${T.green}14`,
  },
  {
    id: 'account-linking-guide',
    title: 'دليل ربط الحسابات',
    description: 'دليل شامل لربط حسابات بورصتك وصلاحيات API وإدارة الحسابات المربوطة',
    icon: <Link2 size={22} />,
    color: T.amber,
    bg: `${T.amber}14`,
  },
]

/* ── FAQ Accordion Item ── */
function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{
      borderBottom: `1px solid ${T.border}`,
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 0', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'right' as const,
          color: isOpen ? T.text : T.text2,
          fontSize: 13, fontWeight: isOpen ? 700 : 500,
          fontFamily: "'Cairo', sans-serif",
          transition: 'color 0.2s',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isOpen ? `${T.cyan}14` : T.surface,
          transition: 'all 0.3s',
        }}>
          <ChevronDown
            size={13}
            color={isOpen ? T.cyan : T.text4}
            style={{
              transition: 'transform 0.3s',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
        <span style={{ flex: 1, minWidth: 0 }}>{item.question}</span>
      </button>
      <div style={{
        maxHeight: isOpen ? 500 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s ease-in-out, opacity 0.3s',
        opacity: isOpen ? 1 : 0,
      }}>
        <div style={{
          padding: '0 34px 16px 0', fontSize: 12.5, lineHeight: 1.9,
          color: T.text3, fontFamily: "'Cairo', sans-serif",
        }}>
          {item.answer}
        </div>
      </div>
    </div>
  )
}

/* ── FAQ Category Section ── */
function FAQCategorySection({
  category,
  openItems,
  onToggleItem,
}: {
  category: FAQCategory
  openItems: Set<string>
  onToggleItem: (id: string) => void
}) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Category Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        background: `${category.iconBg}08`,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: category.iconBg, flexShrink: 0,
          color: category.iconColor,
        }}>
          {category.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
            {category.title}
          </div>
          <div style={{ fontSize: 10, color: T.text4, marginTop: 1, fontFamily: "'Cairo', sans-serif" }}>
            {category.items.length} أسئلة شائعة
          </div>
        </div>
        <span style={{
          fontSize: 9, padding: '3px 8px', borderRadius: 10,
          background: `${category.iconColor}10`, color: category.iconColor,
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
        }}>
          {category.items.length}
        </span>
      </div>
      {/* Category Items */}
      <div style={{ padding: '0 20px' }}>
        {category.items.map(item => (
          <FAQAccordion
            key={item.id}
            item={item}
            isOpen={openItems.has(item.id)}
            onToggle={() => onToggleItem(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main Help Center Page
══════════════════════════════════════════════════════ */
export default function HelpCenterPage() {
  useScopedStyle(`@media (max-width: 767px) {
          .help-quick-grid { grid-template-columns: 1fr !important; }
          .help-contact-grid { grid-template-columns: 1fr !important; }
          .help-content { padding: 12px !important; }
          .help-header-inner { flex-direction: column !important; align-items: flex-start !important; }
          .help-search-box { width: 100% !important; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .help-quick-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        @keyframes help-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .help-fade-in { animation: help-fade-in 0.4s ease-out; }
        @keyframes help-pulse-glow {
          0%, 100% { box-shadow: 0 0 8px ${T.cyan}20; }
          50% { box-shadow: 0 0 20px ${T.cyan}40; }
        }
@keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }`)

  const [searchQuery, setSearchQuery] = useState('')
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [activeContactTab, setActiveContactTab] = useState<'email' | 'chat' | 'docs'>('email')
  const [feedbackName, setFeedbackName] = useState('')
  const [feedbackEmail, setFeedbackEmail] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackSubject, setFeedbackSubject] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  /* ── Search Filtering ── */
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return faqCategories
    const q = searchQuery.trim().toLowerCase()
    return faqCategories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(
          item =>
            item.question.toLowerCase().includes(q) ||
            item.answer.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.items.length > 0)
  }, [searchQuery])

  const totalResults = useMemo(
    () => filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0),
    [filteredCategories]
  )

  /* ── Toggle FAQ Item ── */
  const toggleItem = useCallback((id: string) => {
    setOpenItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ── Submit Feedback Form ── */
  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackName.trim() || !feedbackEmail.trim() || !feedbackMessage.trim()) {
      toast({
        title: 'حقول مطلوبة',
        description: 'يرجى تعبئة جميع الحقول المطلوبة قبل الإرسال',
        variant: 'destructive',
      })
      return
    }
    setIsSubmitting(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1200))
    setIsSubmitting(false)
    toast({
      title: 'تم إرسال رسالتك',
      description: 'شكراً لتواصلك معنا! سنرد عليك خلال 24 ساعة',
    })
    setFeedbackName('')
    setFeedbackEmail('')
    setFeedbackMessage('')
    setFeedbackSubject('')
  }, [feedbackName, feedbackEmail, feedbackMessage, feedbackSubject])

  return (
    <div
      className="custom-scrollbar"
      style={{
        direction: 'inherit',
        fontFamily: "'Cairo', sans-serif",
        height: '100%',
        overflowY: 'auto',
        background: T.bg,
      }}
    >
      {/* Scoped styles via useScopedStyle */}{/* ═══ Header ═══ */}
      <div style={{
        padding: '28px 24px 20px',
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg2}, ${T.bg})`,
      }}>
        <div className="help-header-inner" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 20px ${T.cyan}30`,
            flexShrink: 0,
          }}>
            <HelpCircle size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
              مركز المساعدة
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
              كل ما تحتاج معرفته عن منصة رؤى — أدلة، أسئلة شائعة، ودعم فني مباشر
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <Search
            size={16}
            color={T.text4}
            style={{
              position: 'absolute', insetInlineEnd: 14, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث في الأسئلة الشائعة..."
            aria-label="بحث في مركز المساعدة"
            className="help-search-box"
            style={{
              width: '100%', background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: '12px 42px 12px 16px',
              color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 13,
              outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={e => { e.target.style.borderColor = T.cyan; e.target.style.boxShadow = `0 0 0 3px ${T.cyan}15` }}
            onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="مسح البحث"
              style={{
                position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.text4, display: 'flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {searchQuery.trim() && (
          <div style={{ marginTop: 8, fontSize: 11, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>
            {totalResults > 0
              ? `تم العثور على ${totalResults} نتيجة لـ "${searchQuery.trim()}"`
              : `لا توجد نتائج لـ "${searchQuery.trim()}" — جرّب كلمات مختلفة`}
          </div>
        )}
      </div>

      {/* ═══ Content ═══ */}
      <div className="help-content" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

        {/* ═══ Quick Links Grid ═══ */}
        {!searchQuery.trim() && (
          <section aria-labelledby="quick-links-heading" className="help-fade-in">
            <h2 id="quick-links-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 14, fontFamily: "'Cairo', sans-serif" }}>
              روابط سريعة
            </h2>
            <div className="help-quick-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {quickLinks.map(link => (
                <button
                  key={link.id}
                  style={{
                    background: T.card, border: `1px solid ${T.border}`,
                    borderRadius: 14, padding: '20px 16px', cursor: 'pointer',
                    textAlign: 'right' as const, transition: 'all 0.25s',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${link.color}30`
                    e.currentTarget.style.background = `${link.color}06`
                    e.currentTarget.style.boxShadow = `0 0 20px ${link.color}10`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = T.border
                    e.currentTarget.style.background = T.card
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: link.bg, color: link.color, flexShrink: 0,
                  }}>
                    {link.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                      {link.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: T.text3, lineHeight: 1.7, fontFamily: "'Cairo', sans-serif" }}>
                      {link.description}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, color: link.color, fontWeight: 700,
                    fontFamily: "'Cairo', sans-serif", marginTop: 'auto',
                  }}>
                    اقرأ المزيد
                    <ExternalLink size={10} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ═══ FAQ Sections ═══ */}
        <section aria-labelledby="faq-heading" className="help-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 id="faq-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
              الأسئلة الشائعة
            </h2>
            {!searchQuery.trim() && (
              <span style={{
                fontSize: 10, color: T.text4, fontFamily: "'JetBrains Mono', monospace",
                padding: '3px 10px', borderRadius: 10, background: T.surface,
                border: `1px solid ${T.border}`,
              }}>
                {faqCategories.reduce((s, c) => s + c.items.length, 0)} سؤال
              </span>
            )}
          </div>

          {filteredCategories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredCategories.map(cat => (
                <FAQCategorySection
                  key={cat.id}
                  category={cat}
                  openItems={openItems}
                  onToggleItem={toggleItem}
                />
              ))}
            </div>
          ) : (
            <div style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: '40px 24px', textAlign: 'center',
            }}>
              <AlertCircle size={36} color={T.text4} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text2, marginBottom: 6, fontFamily: "'Cairo', sans-serif" }}>
                لا توجد نتائج
              </div>
              <div style={{ fontSize: 12, color: T.text4, fontFamily: "'Cairo', sans-serif", lineHeight: 1.7 }}>
                لم نعثر على أسئلة تطابق بحثك. جرّب كلمات مختلفة أو تواصل مع فريق الدعم مباشرة.
              </div>
            </div>
          )}
        </section>

        {/* ═══ Contact & Support Section ═══ */}
        <section aria-labelledby="contact-heading" className="help-fade-in">
          <h2 id="contact-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 14, fontFamily: "'Cairo', sans-serif" }}>
            التواصل والدعم
          </h2>

          <div className="help-contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* ── Contact Methods (Tabs) ── */}
            <div style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, overflow: 'hidden',
            }}>
              {/* Tab Header */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                {[
                  { id: 'email' as const, label: 'البريد الإلكتروني', icon: <Mail size={14} /> },
                  { id: 'chat' as const, label: 'الدردشة المباشرة', icon: <MessageSquare size={14} /> },
                  { id: 'docs' as const, label: 'التوثيق', icon: <FileText size={14} /> },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveContactTab(tab.id)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 6, padding: '14px 8px', border: 'none', cursor: 'pointer',
                      background: activeContactTab === tab.id ? `${T.cyan}08` : 'transparent',
                      color: activeContactTab === tab.id ? T.cyan : T.text3,
                      fontSize: 11, fontWeight: activeContactTab === tab.id ? 800 : 500,
                      fontFamily: "'Cairo', sans-serif",
                      borderBottom: activeContactTab === tab.id ? `2px solid ${T.cyan}` : '2px solid transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ padding: '20px' }}>
                {activeContactTab === 'email' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${T.cyan}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Mail size={18} color={T.cyan} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          البريد الإلكتروني
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                          support@roua.io
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: `${T.cyan}06`, border: `1px solid ${T.cyan}12`,
                      fontSize: 11, color: T.text3, lineHeight: 1.8,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      نرد على جميع رسائل البريد الإلكتروني خلال 24 ساعة كحد أقصى. للطلبات العاجلة، استخدم الدردشة المباشرة. يرجى تضمين عنوان بريدك المسجل في المنصة ووصف واضح للمشكلة لتسريع عملية الدعم.
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { icon: <Clock size={11} />, text: 'رد خلال 24 ساعة' },
                        { icon: <Globe size={11} />, text: 'دعم عربي وإنجليزي' },
                        { icon: <CheckCircle2 size={11} />, text: 'تتبع حالة التذكرة' },
                      ].map((f, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 6,
                          background: T.surface, border: `1px solid ${T.border}`,
                          fontSize: 10, color: T.text2, fontWeight: 600,
                          fontFamily: "'Cairo', sans-serif",
                        }}>
                          {f.icon} {f.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeContactTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${T.green}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <MessageSquare size={18} color={T.green} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          الدردشة المباشرة
                        </div>
                        <div style={{ fontSize: 11, color: T.green, fontFamily: "'Cairo', sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green, boxShadow: `0 0 6px ${T.green}60` }} />
                          متاح الآن
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: `${T.green}06`, border: `1px solid ${T.green}12`,
                      fontSize: 11, color: T.text3, lineHeight: 1.8,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      الدردشة المباشرة متاحة لمشتركي الخطة الاحترافية وما فوق خلال ساعات العمل من الأحد إلى الخميس، 9 صباحاً حتى 9 مساءً بتوقيت السعودية. للخطط الأخرى، يمكنك ترك رسالة وسنرد في أقرب وقت.
                    </div>
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px 20px', borderRadius: 10, border: 'none',
                        background: `linear-gradient(135deg, ${T.green}, ${T.greenDim})`,
                        color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                        fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                      }}
                    >
                      <MessageSquare size={14} />
                      ابدأ الدردشة
                    </button>
                  </div>
                )}

                {activeContactTab === 'docs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${T.purple}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <FileText size={18} color={T.purple} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          التوثيق التقني
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
                          docs.roua.io
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: `${T.purple}06`, border: `1px solid ${T.purple}12`,
                      fontSize: 11, color: T.text3, lineHeight: 1.8,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      التوثيق التقني يحتوي على أدلة تفصيلية لكل ميزة في المنصة، مراجع API للمطورين، أمثلة على التكامل، ودروس تعليمية تفاعلية. يتم تحديث التوثيق باستمرار مع كل إصدار جديد من المنصة.
                    </div>
                    {[
                      { label: 'مرجع API', icon: <Zap size={12} /> },
                      { label: 'أدلة التكامل', icon: <RefreshCw size={12} /> },
                      { label: 'دروس تعليمية', icon: <Star size={12} /> },
                      { label: 'سجل التغييرات', icon: <FileText size={12} /> },
                    ].map((doc, i) => (
                      <button
                        key={i}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8, width: '100%',
                          background: T.surface, border: `1px solid ${T.border}`,
                          color: T.text2, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${T.purple}30`; e.currentTarget.style.color = T.purple }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text2 }}
                      >
                        <span style={{ color: T.purple }}>{doc.icon}</span>
                        {doc.label}
                        <ExternalLink size={10} style={{ marginRight: 'auto' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Feedback Form ── */}
            <div style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, overflow: 'hidden',
            }}>
              {/* Form Header */}
              <div style={{
                padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${T.amber}14`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Sparkles size={16} color={T.amber} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                    أرسل ملاحظاتك
                  </div>
                  <div style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>
                    نسعى دائماً لتحسين المنصة بناءً على تجربتك
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Name & Email Row */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                      الاسم *
                    </label>
                    <input
                      type="text"
                      value={feedbackName}
                      onChange={e => setFeedbackName(e.target.value)}
                      placeholder="اسمك الكامل"
                      aria-label="الاسم"
                      style={{
                        width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 8, padding: '10px 12px',
                        color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 12,
                        outline: 'none', transition: 'border-color 0.2s',
                      }}
                      onFocus={e => e.target.style.borderColor = T.cyan}
                      onBlur={e => e.target.style.borderColor = T.border}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                      البريد الإلكتروني *
                    </label>
                    <input
                      type="email"
                      value={feedbackEmail}
                      onChange={e => setFeedbackEmail(e.target.value)}
                      placeholder="email@example.com"
                      dir="ltr"
                      aria-label="البريد الإلكتروني"
                      style={{
                        width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 8, padding: '10px 12px',
                        color: T.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        outline: 'none', transition: 'border-color 0.2s',
                        textAlign: 'right',
                      }}
                      onFocus={e => e.target.style.borderColor = T.cyan}
                      onBlur={e => e.target.style.borderColor = T.border}
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                    الموضوع
                  </label>
                  <select
                    value={feedbackSubject}
                    onChange={e => setFeedbackSubject(e.target.value)}
                    aria-label="موضوع الرسالة"
                    style={{
                      width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: 8, padding: '10px 12px',
                      color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 12,
                      outline: 'none', cursor: 'pointer', direction: 'inherit',
                      appearance: 'none',
                    }}
                  >
                    <option value="">اختر الموضوع</option>
                    <option value="bug">الإبلاغ عن مشكلة تقنية</option>
                    <option value="feature">اقتراح ميزة جديدة</option>
                    <option value="account">مشكلة في الحساب</option>
                    <option value="billing">استفسار عن الاشتراك</option>
                    <option value="other">موضوع آخر</option>
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                    الرسالة *
                  </label>
                  <textarea
                    value={feedbackMessage}
                    onChange={e => setFeedbackMessage(e.target.value)}
                    placeholder="اكتب رسالتك هنا... كلما كانت التفاصيل أكثر، كان الدعم أسرع"
                    rows={4}
                    aria-label="نص الرسالة"
                    style={{
                      width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: 8, padding: '10px 12px',
                      color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 12,
                      outline: 'none', resize: 'vertical', minHeight: 80,
                      transition: 'border-color 0.2s', lineHeight: 1.7,
                    }}
                    onFocus={e => e.target.style.borderColor = T.cyan}
                    onBlur={e => e.target.style.borderColor = T.border}
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmitting}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: 10, border: 'none',
                    background: isSubmitting ? T.surface : `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
                    color: isSubmitting ? T.text3 : '#000',
                    fontSize: 13, fontWeight: 800, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send size={14} style={{ transform: 'rotate(180deg)' }} />
                      إرسال الملاحظات
                    </>
                  )}
                </button>

                {/* Trust indicators */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 8,
                  background: `${T.green}04`, border: `1px solid ${T.green}10`,
                }}>
                  <Lock size={12} color={T.green} />
                  <span style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                    بياناتك محمية بالكامل ونستخدمها فقط للرد على استفسارك
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Bottom Stats Bar ═══ */}
        {!searchQuery.trim() && (
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap',
          }}>
            {[
              { icon: <Users size={14} />, label: 'أكثر من 10,000 مستخدم نشط', color: T.cyan },
              { icon: <Clock size={14} />, label: 'متوسط وقت الرد: أقل من 4 ساعات', color: T.green },
              { icon: <Star size={14} />, label: 'تقييم الدعم: 4.8/5', color: T.amber },
              { icon: <Globe size={14} />, label: 'دعم باللغتين العربية والإنجليزية', color: T.purple },
            ].map((stat, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10,
                background: T.card, border: `1px solid ${T.border}`,
                fontSize: 10.5, color: T.text2, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif",
              }}>
                <span style={{ color: stat.color }}>{stat.icon}</span>
                {stat.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Spinning animation for submit button */}
      {/* Scoped styles via useScopedStyle */}</div>
  )
}
