'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Fingerprint } from 'lucide-react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

const PARTICLE_COUNT = 24;

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 240,
    y: (Math.random() - 0.5) * 120,
    size: Math.random() * 4 + 2,
    delay: Math.random() * 0.4,
    duration: Math.random() * 0.4 + 0.4,
  }));
}

const fadeInUp = {
  hidden: {
    opacity: 0,
    y: 30,
  },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay,
      ease: 'easeOut' as const,
    },
  }),
};

export default function CTASection() {
  const [isHovered, setIsHovered] = useState(false);
  const particles = useMemo(() => generateParticles(), []);

  return (
    <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/[0.04] rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-orange-500/[0.03] rounded-full blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto text-center">
        {/* Title */}
        <motion.h2
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          custom={0}
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-8 leading-tight"
        >
          هل أنت مستعد للانضمام إلى{' '}
          <span className="bg-gradient-to-l from-cyan-400 to-teal-300 bg-clip-text text-transparent">
            مستقبل التداول
          </span>
          ؟
        </motion.h2>

        {/* CTA Button with Particles */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          custom={0.2}
          className="relative inline-block mb-8"
        >
          {/* Particles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ width: '100%', height: '100%' }}>
            {particles.map((particle) => (
              <motion.div
                key={particle.id}
                className="absolute rounded-full"
                style={{
                  width: particle.size,
                  height: particle.size,
                  background: 'rgba(78, 205, 196, 0.6)',
                  left: '50%',
                  top: '50%',
                }}
                animate={
                  isHovered
                    ? {
                        x: 0,
                        y: 0,
                        opacity: 0.9,
                        scale: 1.5,
                      }
                    : {
                        x: particle.x,
                        y: particle.y,
                        opacity: 0.3,
                        scale: 1,
                      }
                }
                transition={{
                  duration: particle.duration,
                  delay: particle.delay,
                  ease: 'easeOut',
                }}
              />
            ))}
          </div>

          {/* Button */}
          <Link href="/login">
            <motion.button
              onHoverStart={() => setIsHovered(true)}
              onHoverEnd={() => setIsHovered(false)}
              whileHover={{
                scale: 1.05,
                boxShadow: '0 0 40px rgba(78, 205, 196, 0.4), 0 0 80px rgba(78, 205, 196, 0.15)',
              }}
              whileTap={{ scale: 0.98 }}
              className="relative z-10 px-10 py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-l from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 transition-colors duration-300 flex items-center gap-3 mx-auto shadow-lg shadow-cyan-500/20"
            >
              <span>انضم إلى الرحلة</span>
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          </Link>
        </motion.div>

        {/* Passkeys Note */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          custom={0.4}
          className="flex items-center justify-center gap-2 text-white/40"
        >
          <Fingerprint className="w-4 h-4" />
          <span className="text-sm">لا حاجة لكلمة مرور — Passkeys فقط</span>
        </motion.div>

        {/* Decorative Line */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          custom={0.5}
          className="mt-16 mx-auto max-w-md"
        >
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </motion.div>
      </div>
    </section>
  );
}
