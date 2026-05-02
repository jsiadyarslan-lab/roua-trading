'use client';

import { useEffect, useRef } from 'react';

const features = [
  {
    num: '01', icon: '🗣️',
    title: 'المحلل متعدد اللغات', titleEn: 'Polyglot Analyst',
    desc: 'يحلل الأسواق بلغات متعددة في الوقت الفعلي، مما يمنحك رؤى عالمية دون حواجز لغوية. يدعم العربية والإنجليزية والصينية واليابانية وغيرها من اللغات الرئيسية.',
    meta: ['🌍 12+ لغة', '⚡ تحليل فوري', '🎯 دقة 94%']
  },
  {
    num: '02', icon: '📡',
    title: 'إشارات رؤى', titleEn: 'Roua Signals',
    desc: 'إشارات تداول فورية مدعومة بالذكاء الاصطناعي، تعتمد على تحليل الأنماط والمشاعر السوقية لتقديم توصيات دقيقة بنسبة نجاح تتجاوز 87%.',
    meta: ['🎯 87% دقة', '⏱️ تنبيه فوري', '📊 50+ زوج']
  },
  {
    num: '03', icon: '📰',
    title: 'رادار الأخبار الموحد', titleEn: 'Unified News Radar',
    desc: 'يراقب آلاف المصادر الإخبارية والاجتماعية في وقت واحد، ويصفي الإشارات الضوضائية ليقدم لك فقط ما يؤثر على محفظتك.',
    meta: ['📡 5000+ مصدر', '⚡ 15 دقيقة أسبق', '🧠 تصفية ذكية']
  },
  {
    num: '04', icon: '🛡️',
    title: 'ملاذ المحفظة', titleEn: 'Portfolio Sanctuary',
    desc: 'حماية ذكية لمحفظتك من التقلبات الحادة عبر تنبيهات المخاطر التنبؤية وتوصيات إعادة التوازن التلقائية.',
    meta: ['🛡️ حماية 24/7', '📉 تقليل المخاطر', '⚖️ توازن تلقائي']
  },
  {
    num: '05', icon: '🧪',
    title: 'المختبر الذكي', titleEn: 'Smart Lab',
    desc: 'اختبر استراتيجياتك في بيئة محاكاة واقعية قبل المخاطرة. حلل الأداء التاريخي وحسّن معاملاتك بناءً على بيانات حقيقية.',
    meta: ['🧪 محاكاة حقيقية', '📈 بيانات تاريخية', '🔧 تحسين تلقائي']
  },
];

function FeatureCard({ feature }: { feature: typeof features[0] }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / 20;
      const rotateY = (centerX - x) / 20;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-10px) scale(1.01)`;
    };

    const handleMouseLeave = () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0) scale(1)';
    };

    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className="feature-card fade-in" ref={cardRef}>
      <div className="feature-number">{feature.num}</div>
      <div className="feature-icon">{feature.icon}</div>
      <h3>{feature.title} <span>{feature.titleEn}</span></h3>
      <p>{feature.desc}</p>
      <div className="feature-meta">
        {feature.meta.map((tag, i) => (
          <span key={i}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

export default function FeaturesSection() {
  return (
    <section className="section features-section" id="features">
      <div className="section-header fade-in">
        <div className="section-label">CORE FEATURES</div>
        <h2 className="section-title">
          أدوات متقدمة للمتداول<br /><span className="highlight">الذكي</span>
        </h2>
        <p className="section-desc">
          مجموعة متكاملة من الأدوات المدعومة بالذكاء الاصطناعي لتحليل الأسواق واتخاذ قرارات أذكى
        </p>
      </div>
      <div className="features-grid">
        {features.map((feature, i) => (
          <FeatureCard key={i} feature={feature} />
        ))}
      </div>
    </section>
  );
}
