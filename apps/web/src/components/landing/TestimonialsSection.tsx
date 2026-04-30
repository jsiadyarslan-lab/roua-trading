'use client';

const testimonials = [
  {
    tag: 'محلل متعدد اللغات',
    text: 'المحلل متعدد اللغات غيّر طريقة عملي بالكامل. أستطيع الآن تحليل الأخبار من 12 لغة في نفس اللحظة.',
    name: 'سارة خ.',
    role: 'مديرة محفظة',
    initial: 'س',
    color: '#00d4ff',
  },
  {
    tag: 'إشارات رؤى',
    text: 'إشارات رؤى دقيقة بشكل مذهل. الدقة تتجاوز 87% بشكل مستمر وهذا غير معهود في أي منصة أخرى.',
    name: 'عمر أ.',
    role: 'متداول يومي',
    initial: 'ع',
    color: '#34d399',
  },
  {
    tag: 'رادار الأخبار',
    text: 'رادار الأخبار يلتقط الأحداث قبل أن تؤثر على السوق. السبق بـ 15 دقيقة يعني كل شيء في التداول.',
    name: 'يوكي ت.',
    role: 'محلل كمي',
    initial: 'ي',
    color: '#a78bfa',
  },
];

export default function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      style={{
        position: 'relative',
        zIndex: 10,
        padding: '80px 20px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <span className="section-label">TESTIMONIALS</span>
        <h2
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 700,
            color: '#f0f9ff',
            marginTop: '12px',
            fontFamily: "var(--font-noto-naskh), serif",
          }}
        >
          ماذا يقول المتداولون
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
        }}
      >
        {testimonials.map((t, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '16px',
              padding: '28px 24px',
              transition: 'border-color 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${t.color}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            <span
              style={{
                display: 'inline-block',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: t.color,
                padding: '4px 12px',
                borderRadius: '20px',
                background: `${t.color}15`,
                border: `1px solid ${t.color}25`,
                marginBottom: '16px',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {t.tag}
            </span>
            <div
              style={{
                fontSize: '2.5rem',
                color: `${t.color}30`,
                lineHeight: 1,
                marginBottom: '8px',
                fontFamily: "var(--font-noto-naskh), serif",
              }}
            >
              &ldquo;
            </div>
            <p
              style={{
                fontSize: '0.95rem',
                color: '#94a3b8',
                lineHeight: 1.8,
                marginBottom: '20px',
                fontFamily: "var(--font-ibm-plex), sans-serif",
              }}
            >
              {t.text}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${t.color}30, ${t.color}10)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: t.color,
                  fontFamily: "var(--font-noto-naskh), serif",
                }}
              >
                {t.initial}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: '#f0f9ff',
                    fontFamily: "var(--font-ibm-plex), sans-serif",
                  }}
                >
                  {t.name}
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#475569',
                    fontFamily: "var(--font-ibm-plex), sans-serif",
                  }}
                >
                  {t.role}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
