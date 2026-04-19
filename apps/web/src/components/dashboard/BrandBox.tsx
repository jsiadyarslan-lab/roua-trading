'use client'

export default function BrandBox() {
  return (
    <div className="brand-box" style={{ gridArea: 'brand' }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(at 50% 42%, rgba(10,132,255,0.08) 0%, transparent 68%)' }} />

      {/* Star dots background */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(1px at 20% 15%, rgba(255,255,255,0.5) 0%, transparent 1px), radial-gradient(1px at 60% 25%, rgba(255,255,255,0.35) 0%, transparent 1px), radial-gradient(1px at 35% 55%, rgba(255,255,255,0.4) 0%, transparent 1px), radial-gradient(1px at 75% 65%, rgba(255,255,255,0.3) 0%, transparent 1px), radial-gradient(1px at 45% 80%, rgba(255,255,255,0.25) 0%, transparent 1px), radial-gradient(1px at 15% 75%, rgba(255,255,255,0.3) 0%, transparent 1px), radial-gradient(1px at 85% 40%, rgba(255,255,255,0.2) 0%, transparent 1px), radial-gradient(1px at 55% 10%, rgba(255,255,255,0.45) 0%, transparent 1px)' }} />

      {/* Atom/Planet animation container */}
      <div style={{ position: 'relative', width: '144px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 600 }}>
        {/* Halo pulse */}
        <div style={{ position: 'absolute', width: '86px', height: '86px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(10,132,255,0.07) 0%, transparent 70%)', filter: 'blur(16px)', animation: 'halo-pulse 3.5s ease-in-out infinite' }} />

        {/* Orbital ring 1 — cyan/tilted */}
        <div style={{ position: 'absolute', width: '68px', height: '68px', borderRadius: '50%', border: '1px solid rgba(0,255,198,0.22)', transform: 'rotateX(48deg) rotateZ(42deg)' }} />

        {/* Orbital ring 2 — gold/tilted */}
        <div style={{ position: 'absolute', width: '84px', height: '84px', borderRadius: '50%', border: '1px solid rgba(255,184,0,0.22)', transform: 'rotateX(22deg) rotateZ(-8deg)' }} />

        {/* Orbital ring 3 — blue/wide */}
        <div style={{ position: 'absolute', width: '96px', height: '96px', borderRadius: '50%', border: '1px solid rgba(10,132,255,0.18)', transform: 'rotateX(62deg) rotateZ(-25deg)' }} />

        {/* Central planet */}
        <div style={{ position: 'absolute', width: '42px', height: '42px', borderRadius: '50%', background: 'radial-gradient(circle at 28% 28%, rgba(80,160,240,0.85) 0%, rgba(20,55,130,0.92) 38%, rgba(8,18,48,0.98) 65%, rgb(3,6,18) 100%)', boxShadow: '0 0 16.8px rgba(10,132,255,0.5), 0 0 33.6px rgba(10,132,255,0.15), inset 2.52px 2.52px 5.88px rgba(120,200,255,0.22), inset -3.36px -3.36px 6.3px rgba(0,0,0,0.65)', animation: 'planet-breathe 4s ease-in-out infinite', zIndex: 3 }} />

        {/* Orbiting dot — blue (fast) */}
        <div style={{ position: 'absolute', width: 0, height: 0, animation: 'orbit-cw 5s linear infinite', zIndex: 4 }}>
          <div style={{ position: 'absolute', width: '5px', height: '5px', top: '-2.5px', left: '-2.5px', borderRadius: '50%', background: '#0A84FF', boxShadow: '0 0 12.5px #0A84FF', transform: 'translateX(26px)' }} />
        </div>

        {/* Orbiting dot — cyan (medium) */}
        <div style={{ position: 'absolute', width: 0, height: 0, animation: 'orbit-ccw 9s linear 2.2s infinite', zIndex: 4 }}>
          <div style={{ position: 'absolute', width: '3.5px', height: '3.5px', top: '-1.75px', left: '-1.75px', borderRadius: '50%', background: '#00FFC6', boxShadow: '0 0 8.75px #00FFC6', transform: 'translateX(34px)' }} />
        </div>

        {/* Orbiting dot — gold (slow) */}
        <div style={{ position: 'absolute', width: 0, height: 0, animation: 'orbit-cw 14s linear 1s infinite', zIndex: 4 }}>
          <div style={{ position: 'absolute', width: '3.5px', height: '3.5px', top: '-1.75px', left: '-1.75px', borderRadius: '50%', background: '#FFB800', boxShadow: '0 0 8.75px #FFB800', transform: 'translateX(42px)' }} />
        </div>
      </div>

      {/* Brand text */}
      <div style={{ position: 'absolute', bottom: '10px', zIndex: 3, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-ar)', fontSize: '11px', fontWeight: 800, letterSpacing: '0.15em', color: 'var(--accent)', opacity: 0.7 }}>رؤى</div>
      </div>

      {/* Right edge glow line */}
      <div style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: '1px', background: 'linear-gradient(transparent, rgba(10,132,255,0.25) 40%, rgba(10,132,255,0.25) 60%, transparent)', pointerEvents: 'none' }} />
    </div>
  )
}
