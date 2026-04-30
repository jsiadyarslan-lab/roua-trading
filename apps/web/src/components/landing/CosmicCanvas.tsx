'use client';

import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  phase: number;
}

interface Nebula {
  x: number;
  y: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

interface Satellite {
  angle: number;
  radius: number;
  speed: number;
  color: string;
  size: number;
  name: string;
  info: string;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface TrailPoint {
  x: number;
  y: number;
  opacity: number;
}

interface ExplosionParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export default function CosmicCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const starsRef = useRef<Star[]>([]);
  const nebulaeRef = useRef<Nebula[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const satellitesRef = useRef<Satellite[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const trailRef = useRef<TrailPoint[]>([]);
  const explosionsRef = useRef<ExplosionParticle[]>([]);
  const frameRef = useRef(0);
  const hoveredSatelliteRef = useRef<Satellite | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize stars
    starsRef.current = Array.from({ length: 450 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.8 + 0.2,
      speed: Math.random() * 0.5 + 0.1,
      phase: Math.random() * Math.PI * 2,
    }));

    // Initialize nebulae
    nebulaeRef.current = [
      { x: canvas.width * 0.2, y: canvas.height * 0.3, radius: 300, color: 'rgba(0, 212, 255, 0.03)', vx: 0.15, vy: 0.1 },
      { x: canvas.width * 0.7, y: canvas.height * 0.6, radius: 250, color: 'rgba(167, 139, 250, 0.03)', vx: -0.1, vy: 0.12 },
      { x: canvas.width * 0.5, y: canvas.height * 0.2, radius: 200, color: 'rgba(244, 114, 182, 0.02)', vx: 0.08, vy: -0.1 },
      { x: canvas.width * 0.3, y: canvas.height * 0.8, radius: 280, color: 'rgba(0, 212, 255, 0.02)', vx: -0.12, vy: 0.08 },
      { x: canvas.width * 0.8, y: canvas.height * 0.4, radius: 220, color: 'rgba(167, 139, 250, 0.02)', vx: 0.1, vy: -0.15 },
    ];

    // Initialize particles
    particlesRef.current = Array.from({ length: 180 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
    }));

    // Initialize satellites
    satellitesRef.current = [
      { angle: 0, radius: 180, speed: 0.008, color: '#00d4ff', size: 4, name: 'Inference Engine', info: 'معالجة فائقة السرعة' },
      { angle: Math.PI / 3, radius: 220, speed: 0.006, color: '#7dd3fc', size: 3.5, name: 'Polyglot Analyst', info: 'نموذج لغوي متعدد' },
      { angle: (2 * Math.PI) / 3, radius: 160, speed: 0.01, color: '#34d399', size: 3, name: 'Chart Vision', info: 'تحليل الرسوم البيانية' },
      { angle: Math.PI, radius: 240, speed: 0.005, color: '#a78bfa', size: 3.5, name: 'Secure Core', info: 'بنية تحتية آمنة' },
      { angle: (4 * Math.PI) / 3, radius: 200, speed: 0.007, color: '#f472b6', size: 3, name: 'On-Premise AI', info: 'نماذج محلية خاصة' },
      { angle: (5 * Math.PI) / 3, radius: 260, speed: 0.004, color: '#bae6fd', size: 4, name: 'Live Feed', info: 'بيانات سوق شاملة' },
    ];

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      trailRef.current.push({ x: e.clientX, y: e.clientY, opacity: 1 });
      if (trailRef.current.length > 30) trailRef.current.shift();
    };

    const handleClick = (e: MouseEvent) => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (dist < 300) {
        const colors = ['#00d4ff', '#7dd3fc', '#a78bfa', '#f472b6', '#34d399'];
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 3 + 1;
          explosionsRef.current.push({
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            maxLife: 1,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 3 + 1,
          });
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    // Shooting star spawner
    const spawnShootingStar = () => {
      if (shootingStarsRef.current.length < 3 && Math.random() < 0.02) {
        const side = Math.random();
        shootingStarsRef.current.push({
          x: side < 0.5 ? Math.random() * canvas.width : 0,
          y: side >= 0.5 ? Math.random() * canvas.height * 0.5 : 0,
          vx: Math.random() * 4 + 3,
          vy: Math.random() * 2 + 1,
          life: 1,
          maxLife: 1,
          size: Math.random() * 2 + 1,
        });
      }
    };

    const drawSphere = (time: number) => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const sphereRadius = Math.min(canvas.width, canvas.height) * 0.18;

      // Mouse-driven rotation
      const mouseInfluenceX = (mouseRef.current.x - cx) / canvas.width;
      const mouseInfluenceY = (mouseRef.current.y - cy) / canvas.height;
      const rotX = time * 0.0003 + mouseInfluenceY * 0.5;
      const rotY = time * 0.0005 + mouseInfluenceX * 0.5;

      // Draw wireframe sphere grid
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
      ctx.lineWidth = 0.5;

      // Latitude lines
      for (let lat = -3; lat <= 3; lat++) {
        ctx.beginPath();
        const latAngle = (lat / 4) * Math.PI / 2;
        const latRadius = sphereRadius * Math.cos(latAngle);
        const latY = sphereRadius * Math.sin(latAngle);
        for (let lon = 0; lon <= 36; lon++) {
          const lonAngle = (lon / 36) * Math.PI * 2 + rotY;
          const x = cx + latRadius * Math.cos(lonAngle);
          const y = cy + latY * Math.sin(rotX) + latRadius * Math.sin(lonAngle) * Math.cos(rotX) * 0.3;
          if (lon === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Longitude lines
      for (let lon = 0; lon < 12; lon++) {
        ctx.beginPath();
        const lonAngle = (lon / 12) * Math.PI * 2 + rotY;
        for (let lat = -18; lat <= 18; lat++) {
          const latAngle = (lat / 18) * Math.PI / 2;
          const latRadius = sphereRadius * Math.cos(latAngle);
          const latY = sphereRadius * Math.sin(latAngle);
          const x = cx + latRadius * Math.cos(lonAngle);
          const y = cy + latY * Math.sin(rotX) + latRadius * Math.sin(lonAngle) * Math.cos(rotX) * 0.3;
          if (lat === -18) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Grid points
      const points: { x: number; y: number; z: number }[] = [];
      for (let lat = -2; lat <= 2; lat++) {
        for (let lon = 0; lon < 8; lon++) {
          const latAngle = (lat / 3) * Math.PI / 2;
          const lonAngle = (lon / 8) * Math.PI * 2 + rotY;
          const x3d = sphereRadius * Math.cos(latAngle) * Math.cos(lonAngle);
          const y3d = sphereRadius * Math.sin(latAngle);
          const z3d = sphereRadius * Math.cos(latAngle) * Math.sin(lonAngle);

          const x = cx + x3d;
          const y = cy + y3d * Math.cos(rotX) - z3d * Math.sin(rotX) * 0.3;
          const z = y3d * Math.sin(rotX) + z3d * Math.cos(rotX);

          points.push({ x, y, z });
          const alpha = z > 0 ? 0.6 : 0.2;
          ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Connections between nearby points
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dist = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[j].x, points[j].y);
            ctx.stroke();
          }
        }
      }

      // Candlestick charts inside sphere
      const candleData = [
        { o: -20, c: -35, h: -15, l: -40 },
        { o: -35, c: -25, h: -20, l: -40 },
        { o: -25, c: -40, h: -20, l: -45 },
        { o: -40, c: -30, h: -25, l: -45 },
        { o: -30, c: -15, h: -10, l: -35 },
        { o: -15, c: -25, h: -10, l: -30 },
        { o: -25, c: -10, h: -5, l: -30 },
        { o: -10, c: -20, h: -5, l: -25 },
      ];

      const candleWidth = 8;
      const candleSpacing = 14;
      const startX = cx - (candleData.length * candleSpacing) / 2;

      candleData.forEach((candle, i) => {
        const x = startX + i * candleSpacing;
        const bullish = candle.c > candle.o;
        const color = bullish ? 'rgba(52, 211, 153, 0.5)' : 'rgba(248, 113, 113, 0.5)';

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, cy + candle.h);
        ctx.lineTo(x, cy + candle.l);
        ctx.stroke();

        // Body
        ctx.fillStyle = color;
        const bodyTop = cy + Math.min(candle.o, candle.c);
        const bodyHeight = Math.abs(candle.c - candle.o);
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, Math.max(bodyHeight, 2));
      });
    };

    const drawSatellites = (time: number) => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      let hovered: Satellite | null = null;

      satellitesRef.current.forEach((sat) => {
        sat.angle += sat.speed;
        const x = cx + sat.radius * Math.cos(sat.angle);
        const y = cy + sat.radius * Math.sin(sat.angle) * 0.6; // elliptical

        // Orbit trail
        ctx.strokeStyle = `${sat.color}15`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, sat.radius, sat.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Satellite dot
        ctx.fillStyle = sat.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = sat.color;
        ctx.beginPath();
        ctx.arc(x, y, sat.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Check hover
        const dist = Math.hypot(mouseRef.current.x - x, mouseRef.current.y - y);
        if (dist < 20) {
          hovered = { ...sat, angle: sat.angle };
        }
      });

      hoveredSatelliteRef.current = hovered;

      // Draw info panel for hovered satellite
      if (hovered) {
        const x = cx + hovered.radius * Math.cos(hovered.angle);
        const y = cy + hovered.radius * Math.sin(hovered.angle) * 0.6 - 40;

        ctx.fillStyle = 'rgba(2, 2, 10, 0.9)';
        ctx.strokeStyle = hovered.color;
        ctx.lineWidth = 1;
        const panelW = 160;
        const panelH = 50;
        const px = x - panelW / 2;
        const py = y - panelH;

        ctx.beginPath();
        ctx.roundRect(px, py, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = hovered.color;
        ctx.font = '600 11px IBM Plex Sans Arabic';
        ctx.textAlign = 'center';
        ctx.fillText(hovered.name, x, py + 20);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 10px IBM Plex Sans Arabic';
        ctx.fillText(hovered.info, x, py + 38);
        ctx.textAlign = 'start';
      }
    };

    const animate = (time: number) => {
      frameRef.current = time;
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw nebulae
      nebulaeRef.current.forEach((neb) => {
        neb.x += neb.vx;
        neb.y += neb.vy;
        if (neb.x < -neb.radius || neb.x > canvas.width + neb.radius) neb.vx *= -1;
        if (neb.y < -neb.radius || neb.y > canvas.height + neb.radius) neb.vy *= -1;

        const gradient = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
        gradient.addColorStop(0, neb.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(neb.x - neb.radius, neb.y - neb.radius, neb.radius * 2, neb.radius * 2);
      });

      // Draw stars with parallax
      const mx = (mouseRef.current.x - canvas.width / 2) / canvas.width;
      const my = (mouseRef.current.y - canvas.height / 2) / canvas.height;

      starsRef.current.forEach((star) => {
        const twinkle = Math.sin(time * star.speed * 0.003 + star.phase) * 0.3 + 0.7;
        const parallaxX = star.x + mx * star.size * 15;
        const parallaxY = star.y + my * star.size * 15;

        ctx.fillStyle = `rgba(240, 249, 255, ${star.opacity * twinkle})`;
        ctx.beginPath();
        ctx.arc(parallaxX, parallaxY, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw particles
      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.fillStyle = `rgba(0, 212, 255, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw sphere
      drawSphere(time);

      // Draw satellites
      drawSatellites(time);

      // Shooting stars
      spawnShootingStar();
      shootingStarsRef.current = shootingStarsRef.current.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.015;

        if (s.life <= 0) return false;

        const alpha = s.life;
        ctx.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
        ctx.lineWidth = s.size;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 10, s.y - s.vy * 10);
        ctx.stroke();

        return true;
      });

      // Mouse trail
      trailRef.current = trailRef.current.filter((t) => {
        t.opacity -= 0.04;
        return t.opacity > 0;
      });
      trailRef.current.forEach((t, i) => {
        ctx.fillStyle = `rgba(0, 212, 255, ${t.opacity * 0.5})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 2 * t.opacity, 0, Math.PI * 2);
        ctx.fill();
      });

      // Explosion particles
      explosionsRef.current = explosionsRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life -= 0.02;

        if (p.life <= 0) return false;

        ctx.fillStyle = p.color.replace(')', `, ${p.life})`).replace('rgb', 'rgba');
        // Simple approach: use the color with alpha
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        return true;
      });

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'all',
      }}
    />
  );
}
