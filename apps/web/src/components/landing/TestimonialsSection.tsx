'use client';

import { useEffect, useRef } from 'react';

const testimonials = [
  {
    tag: 'المحلل متعدد اللغات',
    text: 'المحلل متعدد اللغات يتيح تحليل الأسواق العالمية بلغات متعددة، مما يوفر رؤى شاملة دون حاجة لفريق مترجمين.',
    name: 'ميزة المحلل',
    role: 'تحليل متعدد اللغات · Multilingual Analysis',
    initial: '🔄',
  },
  {
    tag: 'إشارات رؤى',
    text: 'إشارات رؤى مدعومة بثمانية نماذج ذكاء اصطناعي تتناقش وتتوصل لإجماع قبل تقديم التوصيات، مما يعزز موثوقية التحليل.',
    name: 'ميزة الإشارات',
    role: 'تحليل متعدد النماذج · Multi-Model Consensus',
    initial: '🎯',
  },
  {
    tag: 'رادار الأخبار',
    text: 'رادار الأخبار يراقب المصادر الإخبارية ويفلتر الأحداث المؤثرة، مما يساعد في اتخاذ قرارات أسرع بناءً على آخر التطورات.',
    name: 'ميزة الرادار',
    role: 'رصد إخباري ذكي · Smart News Tracking',
    initial: '📡',
  },
];

function TestimonialCard({ t }: { t: typeof testimonials[0] }) {
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
      const rotateX = (y - centerY) / 25;
      const rotateY = (centerX - x) / 25;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
    };

    const handleMouseLeave = () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
    };

    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className="testimonial-card fade-in" ref={cardRef}>
      <div className="testimonial-tag">{t.tag}</div>
      <div className="testimonial-quote">&quot;</div>
      <p className="testimonial-text">{t.text}</p>
      <div className="testimonial-author">
        <div className="author-avatar">{t.initial}</div>
        <div className="author-info">
          <h4>{t.name}</h4>
          <span>{t.role}</span>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  return (
    <section className="section" id="testimonials">
      <div className="section-header fade-in">
        <div className="section-label">TESTIMONIALS</div>
        <h2 className="section-title">
          ماذا يقول<br /><span className="highlight">المتداولون</span>
        </h2>
        <p className="section-desc">
          اكتشف الميزات التي تميز منصة رؤى
        </p>
      </div>
      <div className="testimonials-grid">
        {testimonials.map((t, i) => (
          <TestimonialCard key={i} t={t} />
        ))}
      </div>
    </section>
  );
}
