'use client';

const steps = [
  { num: '١', titleAr: 'أنشئ حسابك', titleEn: 'Sign Up', desc: 'سجّل دخولك في أقل من 30 ثانية عبر Google أو Passkey. لا كلمات مرور، لا تعقيد.' },
  { num: '٢', titleAr: 'دع الذكاء يعمل', titleEn: 'AI Analysis', desc: 'ستة نماذج ذكاء اصطناعي تحلل الأسواق وتولّد إشارات تداول بدقة 87%.' },
  { num: '٣', titleAr: 'تداول بثقة', titleEn: 'Trade Smart', desc: 'نفّذ صفقاتك بناءً على رؤى مدعومة بالبيانات مع حماية المخاطر الذكية.' },
  { num: '٤', titleAr: 'احمِ أرباحك', titleEn: 'Protect Profits', desc: 'نظام حماية تلقائي يراقب محفظتك ويُنذرك قبل التقلبات الحادة.' },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how">
      <div className="section-header fade-in">
        <div className="section-label">HOW IT WORKS</div>
        <h2 className="section-title">
          من التسجيل إلى<br /><span className="highlight">الأرباح</span>
        </h2>
        <p className="section-desc">
          أربع خطوات فقط تفصلك عن تداول أذكى مدعوم بالذكاء الاصطناعي
        </p>
      </div>
      <div className="steps-container">
        {steps.map((step, i) => (
          <div className="step-card fade-in" key={i}>
            <div className="step-number">{step.num}</div>
            <h3>{step.titleAr} <span>{step.titleEn}</span></h3>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
