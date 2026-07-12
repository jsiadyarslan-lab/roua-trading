'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, ChartBar, Key, Cpu, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScopedStyle } from '@/components/ScopedStyle';
import { useTranslations } from 'next-intl'
import T from '@/lib/unified-tokens';

interface Planet {
  name: string;
  icon: LucideIcon;
  color: string;
  orbitRadius: number;
  orbitDuration: number;
  descKey: string;
  size: number;
  startAngle: number;
}

const planets: Planet[] = [
  {
    name: 'Groq',
    icon: Sparkles,
    color: '#FF6B35',
    orbitRadius: 90,
    orbitDuration: 14,
    descKey: 'groqDesc',
    size: 48,
    startAngle: 0,
  },
  {
    name: 'GLM-4',
    icon: Zap,
    color: '#4ECDC4',
    orbitRadius: 140,
    orbitDuration: 20,
    descKey: 'glm4Desc',
    size: 44,
    startAngle: 60,
  },
  {
    name: 'Gemini 2.5',
    icon: ChartBar,
    color: '#3B82F6',
    orbitRadius: 190,
    orbitDuration: 26,
    descKey: 'geminiDesc',
    size: 50,
    startAngle: 120,
  },
  {
    name: 'Bedrock',
    icon: Key,
    color: '#8B5CF6',
    orbitRadius: 240,
    orbitDuration: 32,
    descKey: 'bedrockDesc',
    size: 46,
    startAngle: 180,
  },
  {
    name: 'Ollama',
    icon: Cpu,
    color: T.profit,
    orbitRadius: 285,
    orbitDuration: 38,
    descKey: 'ollamaDesc',
    size: 42,
    startAngle: 240,
  },
  {
    name: 'Twelve Data',
    icon: Globe,
    color: '#F59E0B',
    orbitRadius: 325,
    orbitDuration: 44,
    descKey: 'twelveDataDesc',
    size: 44,
    startAngle: 300,
  },
];

const keyframeNames = planets.map((_, i) => `orbit-${i}`);
const counterKeyframeNames = planets.map((_, i) => `counter-orbit-${i}`);

function generateKeyframes() {
  let css = '';
  planets.forEach((planet, i) => {
    css += `
      @keyframes ${keyframeNames[i]} {
        from { transform: rotate(${planet.startAngle}deg) translateX(${planet.orbitRadius}px) rotate(-${planet.startAngle}deg); }
        to { transform: rotate(${planet.startAngle + 360}deg) translateX(${planet.orbitRadius}px) rotate(-${planet.startAngle + 360}deg); }
      }
      @keyframes ${counterKeyframeNames[i]} {
        from { transform: rotate(-${planet.startAngle}deg); }
        to { transform: rotate(-${planet.startAngle + 360}deg); }
      }
    `;
  });
  return css;
}

export default function GalaxyOrchestra() {
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  const t = useTranslations('landing.aiModels');
  const tg = useTranslations('landing.galaxyOrchestra');

  const handlePlanetClick = useCallback((index: number) => {
    setActiveTooltip((prev) => (prev === index ? null : index));
  }, []);

  const handleBackdropClick = useCallback(() => {
    setActiveTooltip(null);
  }, []);

  const maxOrbitRadius = Math.max(...planets.map((p) => p.orbitRadius));
  const containerSize = (maxOrbitRadius + 60) * 2;

  return (
    <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <ScopedStyle dangerouslySetInnerHTML={{ __html: generateKeyframes() }} />

      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
          {t('orchestraTitle')}
        </h2>
        <p className="text-white/50 text-lg max-w-2xl mx-auto">
          {t('orchestraSubtitle')}
        </p>
      </motion.div>

      {/* Galaxy Container */}
      <div
        className="relative mx-auto"
        style={{ width: Math.min(containerSize, 720), height: Math.min(containerSize, 720) }}
      >
        {/* Center Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center z-10">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/30 to-white/5 animate-pulse" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-white/[0.03] blur-sm" />

        {/* Orbit Rings */}
        {planets.map((planet, i) => (
          <div
            key={`orbit-ring-${i}`}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06] pointer-events-none"
            style={{
              width: planet.orbitRadius * 2,
              height: planet.orbitRadius * 2,
            }}
          />
        ))}

        {/* Planets */}
        {planets.map((planet, i) => {
          const Icon = planet.icon;
          const halfSize = Math.min(containerSize, 720) / 2;
          const scaleFactor = Math.min(containerSize, 720) / (maxOrbitRadius * 2 + 120);
          const scaledRadius = planet.orbitRadius * scaleFactor;
          const scaledSize = Math.max(planet.size * scaleFactor, 32);

          return (
            <div
              key={`planet-wrapper-${i}`}
              className="absolute pointer-events-none"
              style={{
                top: '50%',
                left: '50%',
                width: 0,
                height: 0,
              }}
            >
              {/* Orbiting planet element */}
              <div
                className="pointer-events-auto"
                style={{
                  animation: `${keyframeNames[i]} ${planet.orbitDuration}s linear infinite`,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              >
                <motion.button
                  onClick={() => handlePlanetClick(i)}
                  whileHover={{
                    scale: 1.2,
                    boxShadow: `0 0 25px ${planet.color}80, 0 0 50px ${planet.color}40`,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className="relative flex flex-col items-center cursor-pointer focus:outline-none"
                  style={{
                    width: scaledSize,
                    height: scaledSize,
                    marginLeft: -scaledSize / 2,
                    marginTop: -scaledSize / 2,
                  }}
                >
                  {/* Planet circle */}
                  <div
                    className="rounded-full flex items-center justify-center border-2 transition-shadow duration-300"
                    style={{
                      width: scaledSize,
                      height: scaledSize,
                      background: `radial-gradient(circle at 35% 35%, ${planet.color}CC, ${planet.color}66)`,
                      borderColor: `${planet.color}AA`,
                      boxShadow: `0 0 12px ${planet.color}30`,
                    }}
                  >
                    <Icon
                      className="text-white"
                      style={{
                        width: scaledSize * 0.4,
                        height: scaledSize * 0.4,
                      }}
                    />
                  </div>

                  {/* Planet name label */}
                  <span
                    className="absolute text-white/70 font-medium text-center whitespace-nowrap select-none"
                    style={{
                      top: scaledSize + 4,
                      fontSize: Math.max(10, 11 * scaleFactor),
                    }}
                  >
                    {planet.name}
                  </span>
                </motion.button>
              </div>
            </div>
          );
        })}

        {/* Tooltip */}
        <AnimatePresence>
          {activeTooltip !== null && (
            <>
              {/* Invisible backdrop to close tooltip */}
              <div
                className="fixed inset-0 z-20"
                onClick={handleBackdropClick}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                transition={{ duration: 0.2 }}
                className="absolute z-30 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 backdrop-blur-2xl bg-black/60 border border-white/15 rounded-2xl p-5 max-w-xs text-center pointer-events-auto"
              >
                <div
                  className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center"
                  style={{
                    background: `radial-gradient(circle, ${planets[activeTooltip].color}CC, ${planets[activeTooltip].color}44)`,
                    border: `1px solid ${planets[activeTooltip].color}88`,
                  }}
                >
                  {(() => {
                    const TooltipIcon = planets[activeTooltip].icon;
                    return <TooltipIcon className="w-5 h-5 text-white" />;
                  })()}
                </div>
                <h4 className="text-white font-bold text-lg mb-1">
                  {planets[activeTooltip].name}
                </h4>
                <p className="text-white/60 text-sm leading-relaxed">
                  {tg(planets[activeTooltip].descKey)}
                </p>
                <button
                  onClick={handleBackdropClick}
                  className="mt-3 text-white/40 text-xs hover:text-white/70 transition-colors"
                >
                  {tg('closeTooltip')}
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
