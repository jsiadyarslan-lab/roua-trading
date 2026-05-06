'use client';

export default function BlackholeCTA() {
  return (
    <section className="blackhole-section" id="join">
      <div className="blackhole-wrapper">
        <div className="accretion-disk" />
        <div className="accretion-inner" />
        <div className="event-horizon" />
        <div className="cta-text">
          <h2>انضم إلى الكون</h2>
          <span>ابدأ ربط حساباتك</span>
        </div>
      </div>
      <div className="blackhole-caption">
        <h2>هل أنت مستعد لربط حساباتك<br /><span className="highlight">بذكاء؟</span></h2>
        <p>انضم لآلاف المتداولين الذين يثقون في رؤى لاتخاذ قرارات أذكى</p>
        <a href="/api/auth/guest" className="btn btn-glow" style={{ fontSize: '1.15rem', padding: '1.1rem 3.5rem' }}>
          🚀 انضم الآن — مجاناً
        </a>
        <p className="note">لا حاجة لبطاقة ائتمانية · إعداد في أقل من دقيقة · أو <a href="/api/auth/guest" style={{ color: 'rgba(0, 212, 255, 0.6)', textDecoration: 'underline' }}>جرّب كضيف</a></p>
      </div>
    </section>
  );
}
