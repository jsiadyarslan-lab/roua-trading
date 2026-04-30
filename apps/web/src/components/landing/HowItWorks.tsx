'use client';

const steps = [
  { num: '①', titleAr: 'أنشئ حسابك', titleEn: 'Sign Up', desc: 'سجّل في أقل من 30 ثانية' },
  { num: '②', titleAr: 'دع الذكاء يعمل', titleEn: 'AI Analysis', desc: 'النماذج الستة تحلل السوق لك' },
  { num: '③', titleAr: 'تداول بثقة', titleEn: 'Trade Smart', desc: 'إشارات دقيقة لحظة بلحظة' },
  { num: '④', titleAr: 'احمِ أرباحك', titleEn: 'Protect Profits', desc: 'حماية تلقائية لمحفظتك' },
];

export default function HowItWorks() {
  return (
    <section
      id="how"
      style={{
        position: 'relative',
        zIndex: 10,
        padding: '80px 20px',
        maxWidth: '1000px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <span className="section-label">HOW IT WORKS</span>
        <h2
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 700,
            color: '#f0f9ff',
            marginTop: '12px',
            fontFamily: "var(--font-noto-naskh), serif",
          }}
        >
          من التسجيل إلى الأرباح
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: '0',
          flexWrap: 'wrap',
          position: 'relative',
        }}
      >
        {/* Connecting gradient line */}
        <div
          className="hidden md:block"
          style={{
            position: 'absolute',
            top: '36px',
            left: '12%',
            right: '12%',
            height: '2px',
            background: 'linear-gradient(90deg, #00d4ff, #a78bfa, #f472b6, #00d4ff)',
            zIndex: 0,
          }}
        />

        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: '1',
              minWidth: '180px',
              position: 'relative',
              zIndex: 1,
              padding: '0 12px',
            }}
          >
            {/* Step number circle */}
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00d4ff, #7dd3fc)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 700,
                color: '#000',
                marginBottom: '16px',
                position: 'relative',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {step.num}
              {/* Ripple */}
              <div
                style={{
                  position: 'absolute',
                  inset: '-4px',
                  borderRadius: '50%',
                  border: '2px solid rgba(0, 212, 255, 0.3)',
                  animation: `ripple 2s infinite ${i * 0.5}s`,
                }}
              />
            </div>
            <h3
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#f0f9ff',
                marginBottom: '4px',
                fontFamily: "var(--font-noto-naskh), serif",
              }}
            >
              {step.titleAr}
            </h3>
            <p
              style={{
                fontSize: '0.8rem',
                color: '#00d4ff',
                fontWeight: 500,
                marginBottom: '6px',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {step.titleEn}
            </p>
            <p
              style={{
                fontSize: '0.85rem',
                color: '#94a3b8',
                textAlign: 'center',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
