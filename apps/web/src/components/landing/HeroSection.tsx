'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

// ── Typewriter hook ──
function useTypewriter(text: string, speed = 60, startDelay = 1800) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    // Defer state resets to avoid synchronous setState in effect body
    const resetRaf = requestAnimationFrame(() => {
      setDisplayed('')
      setDone(false)
    })

    const delayTimer = setTimeout(() => {
      const interval = setInterval(() => {
        if (indexRef.current < text.length) {
          const nextIndex = indexRef.current + 1
          indexRef.current = nextIndex
          setDisplayed(text.slice(0, nextIndex))
        } else {
          clearInterval(interval)
          setDone(true)
        }
      }, speed)

      return () => clearInterval(interval)
    }, startDelay)

    return () => {
      cancelAnimationFrame(resetRaf)
      clearTimeout(delayTimer)
    }
  }, [text, speed, startDelay])

  return { displayed, done }
}

// ── Logo stellar explosion variants ──
const logoVariants = {
  hidden: {
    scale: 4,
    opacity: 0,
    filter: 'blur(20px) brightness(3)',
  },
  visible: {
    scale: 1,
    opacity: 1,
    filter: 'blur(0px) brightness(1)',
    transition: {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
}

// ── Title fade-in ──
const titleVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: 'easeOut' },
  },
}

// ── Subtitle fade-in ──
const subtitleVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: 'easeOut', delay: 0.2 },
  },
}

// ── Buttons stagger ──
const buttonsContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.4 },
  },
}

const buttonVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
}

// ── Scroll indicator bounce ──
const scrollBounce = {
  animate: {
    y: [0, 10, 0],
    transition: {
      duration: 1.8,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

// ── Pre-computed star positions (avoids hydration mismatch from Math.random) ──
const STARS = Array.from({ length: 40 }).map((_, i) => ({
  id: i,
  top: `${((i * 37 + 13) % 100)}%`,
  left: `${((i * 53 + 7) % 100)}%`,
  duration: 2 + (i % 5) * 0.6,
  delay: (i % 8) * 0.5,
}))

export default function HeroSection() {
  const titleText = 'ببصيرة نحو الأسواق'
  const { displayed: typedTitle, done: typingDone } = useTypewriter(titleText, 55, 1800)

  return (
    <section
      id="hero"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4 text-center"
      dir="rtl"
    >
      {/* ── Ambient glow orbs ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="absolute -bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-amber-400/8 blur-[100px]" />
      </div>

      {/* ── Starfield particles (decorative) ── */}
      <div className="pointer-events-none absolute inset-0">
        {STARS.map((star) => (
          <motion.div
            key={star.id}
            className="absolute h-[2px] w-[2px] rounded-full bg-white/30"
            style={{ top: star.top, left: star.left }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.6, 0],
              scale: [0, 1, 0.5],
            }}
            transition={{
              duration: star.duration,
              repeat: Infinity,
              delay: star.delay,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* ── Content wrapper ── */}
      <div className="relative z-10 flex max-w-4xl flex-col items-center gap-6">
        {/* ── Logo: stellar explosion ── */}
        <div className="relative">
          {/* Glow layer behind the logo text */}
          <motion.div
            variants={logoVariants}
            initial="hidden"
            animate="visible"
            className="text-8xl font-extrabold leading-tight text-teal-400/30 blur-2xl sm:text-9xl"
            aria-hidden="true"
          >
            رؤى
          </motion.div>
          <motion.h1
            variants={logoVariants}
            initial="hidden"
            animate="visible"
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-l from-teal-400 via-teal-300 to-amber-400 bg-clip-text text-8xl font-extrabold leading-tight text-transparent sm:text-9xl"
          >
            رؤى
          </motion.h1>
        </div>

        {/* ── Typewriter title ── */}
        <motion.div
          variants={titleVariants}
          initial="hidden"
          animate="visible"
          className="flex items-center justify-center text-3xl font-bold text-white sm:text-4xl md:text-5xl"
        >
          <span>{typedTitle}</span>
          <AnimatePresence>
            {!typingDone && (
              <motion.span
                className="mr-1 inline-block h-8 w-[3px] rounded-full bg-teal-400 sm:h-10 md:h-12"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </AnimatePresence>
          {typingDone && (
            <motion.span
              className="mr-1 inline-block h-8 w-[3px] rounded-full bg-teal-400 sm:h-10 md:h-12"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </motion.div>

        {/* ── Subtitle ── */}
        <motion.p
          variants={subtitleVariants}
          initial="hidden"
          animate="visible"
          className="max-w-2xl text-base leading-relaxed text-neutral-400 sm:text-lg md:text-xl"
        >
          منصة التداول الوحيدة التي تدمج 6 نماذج ذكاء اصطناعي في سيمفونية كونية واحدة
        </motion.p>

        {/* ── CTA Buttons ── */}
        <motion.div
          variants={buttonsContainerVariants}
          initial="hidden"
          animate="visible"
          className="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-5"
        >
          <motion.div variants={buttonVariants}>
            <Link
              href="/login"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-teal-400 px-8 py-3.5 text-base font-bold text-black transition-all duration-300 hover:bg-teal-300 hover:shadow-[0_0_30px_rgba(45,212,191,0.4)] active:scale-95"
            >
              <span className="relative z-10">ابدأ الرحلة</span>
              <svg
                className="relative z-10 h-5 w-5 rotate-180 transition-transform duration-300 group-hover:-translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <span className="absolute inset-0 -z-0 bg-gradient-to-l from-teal-300/0 via-teal-300/30 to-teal-300/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </Link>
          </motion.div>

          <motion.div variants={buttonVariants}>
            <Link
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-transparent px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:border-teal-400/40 hover:bg-white/5 hover:text-teal-300 active:scale-95"
            >
              استكشف المجرة
              <svg
                className="h-5 w-5 transition-transform duration-300 group-hover:translate-y-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* ── Pulsing scroll indicator ── */}
      <motion.div
        variants={scrollBounce}
        animate="animate"
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs tracking-widest text-neutral-500">اكتشف المزيد</span>
          <div className="flex h-9 w-6 items-start justify-center rounded-full border-2 border-teal-400/40 p-1.5">
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-teal-400"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </motion.div>
    </section>
  )
}
