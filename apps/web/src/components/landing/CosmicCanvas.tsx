'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl'
import T from '@/lib/unified-tokens';

export default function CosmicCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeSatellite, setActiveSatellite] = useState<{ nameKey: string; descKey: string; color: string } | null>(null);
  const lastSatNameRef = useRef<string | null>(null);
  const t = useTranslations('landing.cosmicCanvas');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width: number, height: number;
    let mouseX = 0, mouseY = 0;
    let targetMouseX = 0, targetMouseY = 0;

    type Satellite = {
      nameKey: string
      descKey: string
      color: string
      angle: number
      speed: number
      radius: number
      tilt: number
      size: number
    }

    const satellites: Satellite[] = [
      { nameKey: 'linguisticAnalyst', descKey: 'linguisticAnalystDesc', color: T.info, angle: 0, speed: 0.0045, radius: 320, tilt: 0.45, size: 9 },
      { nameKey: 'chartAnalysis', descKey: 'chartAnalysisDesc', color: '#7dd3fc', angle: 1.0, speed: 0.0035, radius: 390, tilt: 0.35, size: 10 },
      { nameKey: 'dataProcessing', descKey: 'dataProcessingDesc', color: '#34d399', angle: 2.1, speed: 0.0055, radius: 290, tilt: 0.55, size: 8 },
      { nameKey: 'secureInfra', descKey: 'secureInfraDesc', color: '#bae6fd', angle: 3.5, speed: 0.0028, radius: 430, tilt: 0.4, size: 9 },
      { nameKey: 'localModels', descKey: 'localModelsDesc', color: '#a78bfa', angle: 4.2, speed: 0.0045, radius: 350, tilt: 0.5, size: 8 },
      { nameKey: 'liveMarketData', descKey: 'liveMarketDataDesc', color: '#f472b6', angle: 5.0, speed: 0.0065, radius: 260, tilt: 0.3, size: 9 }
    ];

    const stars: { x: number; y: number; z: number; size: number; opacity: number; twinkleSpeed: number }[] = [];
    const numStars = 200;
    const candles: { theta: number; phi: number; open: number; close: number; color: string; life: number; speed: number }[] = [];
    const numCandles = 12;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
    const numParticles = 80;
    const mouseTrail: { x: number; y: number; life: number }[] = [];
    const maxTrail = 20;
    const shootingStars: { x: number; y: number; vx: number; vy: number; length: number; life: number; decay: number }[] = [];
    const nebulaClouds: { x: number; y: number; radius: number; color: string; vx: number; vy: number }[] = [];
    const clickExplosions: { particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[]; life: number }[] = [];

    function resize() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
    }

    function init() {
      resize();
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: Math.random() * 2 + 0.5,
          size: Math.random() * 1.5 + 0.5,
          opacity: Math.random(),
          twinkleSpeed: Math.random() * 0.02 + 0.005
        });
      }
      for (let i = 0; i < numCandles; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        candles.push({
          theta, phi,
          open: Math.random() * 28 + 18,
          close: Math.random() * 28 + 18,
          color: Math.random() > 0.5 ? '#34d399' : '#f87171',
          life: Math.random(),
          speed: 0.003 + Math.random() * 0.007
        });
      }
      for (let i = 0; i < numParticles; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          size: Math.random() * 2,
          opacity: Math.random() * 0.35
        });
      }
      // Nebula clouds
      for (let i = 0; i < 5; i++) {
        nebulaClouds.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 200 + Math.random() * 300,
          color: ['rgba(0, 212, 255, 0.02)', 'rgba(125, 211, 252, 0.015)', 'rgba(167, 139, 250, 0.012)', 'rgba(244, 114, 182, 0.01)', 'rgba(52, 211, 153, 0.01)'][i],
          vx: (Math.random() - 0.5) * 0.1,
          vy: (Math.random() - 0.5) * 0.1
        });
      }
    }

    function spawnShootingStar() {
      if (Math.random() < 0.008) {
        shootingStars.push({
          x: Math.random() * width,
          y: Math.random() * height * 0.5,
          vx: -3 - Math.random() * 4,
          vy: 1 + Math.random() * 2,
          length: 50 + Math.random() * 100,
          life: 1,
          decay: 0.02 + Math.random() * 0.02
        });
      }
    }

    function drawNebula() {
      nebulaClouds.forEach(cloud => {
        cloud.x += cloud.vx;
        cloud.y += cloud.vy;
        if (cloud.x < -cloud.radius) cloud.x = width + cloud.radius;
        if (cloud.x > width + cloud.radius) cloud.x = -cloud.radius;
        if (cloud.y < -cloud.radius) cloud.y = height + cloud.radius;
        if (cloud.y > height + cloud.radius) cloud.y = -cloud.radius;

        const g = ctx!.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.radius);
        g.addColorStop(0, cloud.color);
        g.addColorStop(1, 'transparent');
        ctx!.fillStyle = g;
        ctx!.fillRect(cloud.x - cloud.radius, cloud.y - cloud.radius, cloud.radius * 2, cloud.radius * 2);
      });
    }

    function drawShootingStars() {
      spawnShootingStar();
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life -= s.decay;

        if (s.life <= 0) {
          shootingStars.splice(i, 1);
          continue;
        }

        const tailX = s.x - s.vx * (s.length / 5);
        const tailY = s.y - s.vy * (s.length / 5);

        const g = ctx!.createLinearGradient(s.x, s.y, tailX, tailY);
        g.addColorStop(0, `rgba(255, 255, 255, ${s.life})`);
        g.addColorStop(0.5, `rgba(0, 212, 255, ${s.life * 0.5})`);
        g.addColorStop(1, 'transparent');

        ctx!.strokeStyle = g;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.moveTo(s.x, s.y);
        ctx!.lineTo(tailX, tailY);
        ctx!.stroke();

        ctx!.beginPath();
        ctx!.arc(s.x, s.y, 2, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 255, 255, ${s.life})`;
        ctx!.fill();
      }
    }

    function drawClickExplosions() {
      for (let i = clickExplosions.length - 1; i >= 0; i--) {
        const exp = clickExplosions[i];
        exp.life -= 0.03;
        if (exp.life <= 0) {
          clickExplosions.splice(i, 1);
          continue;
        }
        exp.particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.95;
          p.vy *= 0.95;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.size * exp.life, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(0, 212, 255, ${exp.life * p.opacity})`;
          ctx!.fill();
        });
      }
    }

    function createExplosion(x: number, y: number) {
      const expParticles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
      for (let i = 0; i < 15; i++) {
        const angle = (Math.PI * 2 / 15) * i;
        const speed = 2 + Math.random() * 4;
        expParticles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2 + Math.random() * 3,
          opacity: 0.5 + Math.random() * 0.5
        });
      }
      clickExplosions.push({ particles: expParticles, life: 1 });
    }

    function drawMouseTrail() {
      mouseTrail.push({ x: mouseX, y: mouseY, life: 1 });
      if (mouseTrail.length > maxTrail) mouseTrail.shift();

      for (let i = 0; i < mouseTrail.length - 1; i++) {
        const p = mouseTrail[i];
        p.life -= 0.05;
        if (p.life <= 0) continue;
        const next = mouseTrail[i + 1];
        ctx!.beginPath();
        ctx!.moveTo(p.x, p.y);
        ctx!.lineTo(next.x, next.y);
        ctx!.strokeStyle = `rgba(0, 212, 255, ${p.life * 0.3})`;
        ctx!.lineWidth = p.life * 2;
        ctx!.stroke();
      }
    }

    function drawStars() {
      stars.forEach(star => {
        star.opacity += star.twinkleSpeed;
        if (star.opacity > 1 || star.opacity < 0.15) star.twinkleSpeed *= -1;
        const parallaxX = (mouseX - width/2) * 0.03 * star.z;
        const parallaxY = (mouseY - height/2) * 0.03 * star.z;
        ctx!.beginPath();
        ctx!.arc(star.x + parallaxX, star.y + parallaxY, star.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx!.fill();
      });
    }

    function drawSphere() {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = 220;
      const time = Date.now() * 0.001;

      // Outer glow layers
      for (let i = 3; i >= 1; i--) {
        const g = ctx!.createRadialGradient(centerX, centerY, radius * 0.4, centerX, centerY, radius * (1.5 + i * 0.5));
        g.addColorStop(0, `rgba(0, 212, 255, ${0.06 / i})`);
        g.addColorStop(1, 'transparent');
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, width, height);
      }

      // Wireframe points
      const points: { x: number; y: number; z: number }[] = [];
      const latitudes = 12;
      const longitudes = 14;

      for (let lat = 0; lat <= latitudes; lat++) {
        const theta = (lat / latitudes) * Math.PI;
        for (let lon = 0; lon <= longitudes; lon++) {
          const phi = (lon / longitudes) * Math.PI * 2;
          let x = radius * Math.sin(theta) * Math.cos(phi);
          let y = radius * Math.cos(theta);
          let z = radius * Math.sin(theta) * Math.sin(phi);
          const rotY = (mouseX - width/2) * 0.0006;
          const rotX = (mouseY - height/2) * 0.0006;
          let newX = x * Math.cos(rotY) - z * Math.sin(rotY);
          let newZ = x * Math.sin(rotY) + z * Math.cos(rotY);
          let newY = y * Math.cos(rotX) - newZ * Math.sin(rotX);
          newZ = y * Math.sin(rotX) + newZ * Math.cos(rotX);
          points.push({ x: centerX + newX, y: centerY + newY, z: newZ });
        }
      }

      // Connections
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 55 && points[i].z > -70 && points[j].z > -70) {
            const opacity = (1 - dist/55) * 0.22 * (points[i].z + radius)/(2*radius);
            ctx!.strokeStyle = `rgba(0, 212, 255, ${opacity})`;
            ctx!.lineWidth = 0.7;
            ctx!.beginPath();
            ctx!.moveTo(points[i].x, points[i].y);
            ctx!.lineTo(points[j].x, points[j].y);
            ctx!.stroke();
          }
        }
      }

      // Points
      points.forEach(p => {
        if (p.z > -radius) {
          const size = (p.z + radius) / (2 * radius) * 3 + 0.5;
          const opacity = (p.z + radius) / (2 * radius) * 0.95;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(0, 212, 255, ${opacity})`;
          ctx!.fill();
        }
      });

      // Candles inside sphere
      candles.forEach(candle => {
        candle.life += candle.speed;
        if (candle.life > 1) candle.life = 0;
        const r = radius * 0.55;
        const x = centerX + r * Math.sin(candle.phi + time * 0.25) * Math.cos(candle.theta + time * 0.18);
        const y = centerY + r * Math.cos(candle.phi + time * 0.25);
        const z = r * Math.sin(candle.phi + time * 0.25) * Math.sin(candle.theta + time * 0.18);
        if (z > -radius * 0.5) {
          const scale = (z + radius) / (2 * radius);
          const h = candle.close * scale;
          const w = 5 * scale;
          const opacity = Math.sin(candle.life * Math.PI) * 0.95;
          ctx!.fillStyle = candle.color === '#34d399'
            ? `rgba(52, 211, 153, ${opacity})`
            : `rgba(248, 113, 113, ${opacity})`;
          ctx!.fillRect(x - w/2, y - h/2, w, h);
        }
      });

      return { centerX, centerY, radius };
    }

    function drawSatellites(centerX: number, centerY: number) {
      let hoveredSat: Satellite | null = null;
      satellites.forEach((sat) => {
        sat.angle += sat.speed;
        const x = centerX + Math.cos(sat.angle) * sat.radius;
        const y = centerY + Math.sin(sat.angle) * sat.radius * sat.tilt;
        const z = Math.sin(sat.angle) * 70;
        const scale = (z + 140) / 280;
        const size = sat.size * scale;

        // Orbit ellipse
        ctx!.beginPath();
        ctx!.ellipse(centerX, centerY, sat.radius, sat.radius * sat.tilt, 0, 0, Math.PI * 2);
        ctx!.strokeStyle = sat.color + '12';
        ctx!.lineWidth = 1;
        ctx!.stroke();

        // Glow
        const glow = ctx!.createRadialGradient(x, y, 0, x, y, size * 6);
        glow.addColorStop(0, sat.color + '55');
        glow.addColorStop(1, 'transparent');
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(x, y, size * 6, 0, Math.PI * 2);
        ctx!.fill();

        // Body
        ctx!.beginPath();
        ctx!.arc(x, y, size, 0, Math.PI * 2);
        ctx!.fillStyle = sat.color;
        ctx!.fill();

        // Connection to center
        if (Math.abs(Math.sin(sat.angle)) < 0.2) {
          ctx!.strokeStyle = sat.color + '15';
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(centerX, centerY);
          ctx!.lineTo(x, y);
          ctx!.stroke();
        }

        // Hover detection
        const dx = mouseX - x;
        const dy = mouseY - y;
        if (Math.sqrt(dx*dx + dy*dy) < 28) hoveredSat = sat;
      });

      const activeSat = hoveredSat as Satellite | null;
      const newKey = activeSat?.nameKey ?? null;
      if (newKey !== lastSatNameRef.current) {
        lastSatNameRef.current = newKey;
        setActiveSatellite(activeSat ? { nameKey: activeSat.nameKey, descKey: activeSat.descKey, color: activeSat.color } : null);
      }
      canvas!.style.cursor = activeSat ? 'pointer' : 'default';
    }

    function drawParticles() {
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(125, 211, 252, ${p.opacity})`;
        ctx!.fill();
      });
    }

    let animationId: number;
    let isPageVisible = !document.hidden;
    let lastFrameTime = 0;
    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    function animate(currentTime: number) {
      // Stop rendering when tab is hidden — saves CPU/GPU when user navigates away
      if (!isPageVisible) {
        animationId = requestAnimationFrame(animate);
        return;
      }
      // Throttle to TARGET_FPS to reduce CPU/GPU load
      if (currentTime - lastFrameTime < FRAME_INTERVAL) {
        animationId = requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = currentTime;

      ctx!.clearRect(0, 0, width, height);
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;
      drawNebula();
      drawParticles();
      drawStars();
      drawShootingStars();
      drawMouseTrail();
      const center = drawSphere();
      drawSatellites(center.centerX, center.centerY);
      drawClickExplosions();
      animationId = requestAnimationFrame(animate);
    }

    const handleResize = () => resize();
    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    const handleClick = (e: MouseEvent) => {
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      if (Math.sqrt(dx*dx + dy*dy) < 250) {
        createExplosion(e.clientX, e.clientY);
      }
    };

    // Visibility change handler — pause rendering when tab is hidden
    const handleVisibilityChange = () => {
      isPageVisible = !document.hidden;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('visibilitychange', handleVisibilityChange);
    canvas.addEventListener('click', handleClick);

    init();
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      canvas.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <>
      <div id="canvas-container">
        <canvas id="universe" ref={canvasRef} />
      </div>
      <div className={`satellites-info${activeSatellite ? ' active' : ''}`} id="infoPanel">
        <h3 id="infoTitle" style={activeSatellite ? { color: activeSatellite.color } : undefined}>
          {activeSatellite ? t(activeSatellite.nameKey) : t('defaultTitle')}
        </h3>
        <p id="infoDesc">{activeSatellite ? t(activeSatellite.descKey) : t('defaultDesc')}</p>
      </div>
    </>
  );
}
