'use client';

import { useEffect, useRef } from 'react';

const models = [
  { icon: '⚡', title: 'معالجة فائقة السرعة', desc: 'للاستدلال اللحظي وتحليل السوق في الوقت الفعلي بأداء يتجاوز التوقعات', tag: 'Inference Engine' },
  { icon: '🌐', title: 'نموذج لغوي متعدد', desc: 'يفهم السياق المالي العربي والعالمي بعمق، يدعم العربية والإنجليزية والصينية واليابانية', tag: 'Polyglot Analyst' },
  { icon: '📊', title: 'تحليل الرسوم البيانية', desc: 'تحليل متقدم للأنماط التقنية بدقة عالية مع التعرف الآلي على التشكيلات السعرية', tag: 'Chart Vision' },
  { icon: '🛡️', title: 'بنية تحتية آمنة', desc: 'للنماذج الأساسية مع حماية البيانات على مستوى المؤسسات وتشفير كامل', tag: 'Secure Core' },
  { icon: '🔒', title: 'نماذج محلية خاصة', desc: 'للتحليلات الحساسة بعيداً عن السحابة، تضمن خصوصية كاملة لبياناتك', tag: 'On-Premise AI' },
  { icon: '📡', title: 'بيانات سوق شاملة', desc: 'مباشرة من الأسواق العالمية ومؤشراتها بأقل تأخير ممكن', tag: 'Live Feed' },
];

function ModelCard({ model }: { model: typeof models[0] }) {
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
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale(1.01)`;
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
    <div className="model-card fade-in" ref={cardRef}>
      <div className="model-icon">{model.icon}</div>
      <h3>{model.title}</h3>
      <p>{model.desc}</p>
      <span className="tag">{model.tag}</span>
    </div>
  );
}

export default function AIModelsSection() {
  return (
    <section className="section ai-orchestrator" id="models">
      <div className="section-header fade-in">
        <div className="section-label">AI ORCHESTRATOR</div>
        <h2 className="section-title">
          ستة نماذج ذكاء اصطناعي<br />تعمل <span className="highlight">بتناغم</span>
        </h2>
        <p className="section-desc">
          كل نموذج متخصص في جانب معين من التحليل، ويعملون معاً لتقديم رؤية شاملة للسوق
        </p>
      </div>
      <div className="models-grid">
        {models.map((model, i) => (
          <ModelCard key={i} model={model} />
        ))}
      </div>
    </section>
  );
}
