'use client';

// ═══════════════════════════════════════════════════════════════════
// IntelligenceOrb — Living Light Orb (V513)
// "كرة الذكاء" — أمواج ضوئية تتسع وتتلاشى + قوس دوّار + جسيمات مدارية + شرارة مركزية
// يستبدل BrainIcon داخل زر FAB لإيحاء بالذكاء النشط
// ═══════════════════════════════════════════════════════════════════

export default function IntelligenceOrb({ size = 56 }: { size?: number }) {
  // كل الطبقات مزودة بنسب مئوية حتى تتكيّف مع أي size تلقائياً
  return (
    <div
      className="intelligence-orb-root"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Outer breathing halo */}
      <div className="io-halo" />

      {/* 4 expanding light waves (fade in/out) */}
      <div className="io-waves">
        <div className="io-wave" />
        <div className="io-wave" />
        <div className="io-wave" />
        <div className="io-wave" />
      </div>

      {/* The Intelligence Orb */}
      <div className="io-orb">
        {/* Rotating "thinking" arc */}
        <div className="io-think" />

        {/* Orbiting micro-particles */}
        <div className="io-particle io-particle-1" />
        <div className="io-particle io-particle-2" />

        {/* Flickering center spark */}
        <div className="io-spark" />
      </div>
    </div>
  );
}
