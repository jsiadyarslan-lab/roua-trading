'use client';

import { motion } from 'framer-motion';

const screenshots = [
  {
    label: 'Dashboard',
    labelAr: 'لوحة التحكم',
    gradient: 'from-emerald-900/40 via-teal-900/30 to-cyan-950/40',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Chart',
    labelAr: 'الرسوم البيانية',
    gradient: 'from-blue-900/40 via-indigo-900/30 to-violet-950/40',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: 'Signals',
    labelAr: 'الإشارات',
    gradient: 'from-amber-900/40 via-orange-900/30 to-yellow-950/40',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    label: 'Portfolio',
    labelAr: 'المحفظة',
    gradient: 'from-rose-900/40 via-pink-900/30 to-red-950/40',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-rose-400">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
  },
  {
    label: 'AI Council',
    labelAr: 'مجلس الذكاء',
    gradient: 'from-purple-900/40 via-fuchsia-900/30 to-pink-950/40',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-400">
        <path d="M12 8V4H8" />
        <rect width="16" height="12" x="4" y="8" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M15 13v2" />
        <path d="M9 13v2" />
      </svg>
    ),
  },
  {
    label: 'News',
    labelAr: 'الأخبار',
    gradient: 'from-cyan-900/40 via-sky-900/30 to-teal-950/40',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-5" />
        <path d="M10 6h8v4h-8V6Z" />
      </svg>
    ),
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export default function MediaGallery() {
  return (
    <motion.div
      className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4"
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
    >
      {screenshots.map((item, index) => (
        <motion.div
          key={item.label}
          variants={itemVariants}
          whileHover={{ scale: 1.04, y: -4 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="group cursor-pointer"
        >
          <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all duration-300 group-hover:border-white/20 group-hover:shadow-lg group-hover:shadow-black/20">
            {/* Screenshot Placeholder */}
            <div
              className={`relative aspect-video bg-gradient-to-br ${item.gradient} flex items-center justify-center overflow-hidden`}
            >
              {/* Decorative grid lines */}
              <div className="absolute inset-0 opacity-[0.07]">
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage:
                      'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                />
              </div>

              {/* Decorative floating elements */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-[15%] left-[10%] w-16 h-2 rounded-full bg-white/[0.06]" />
                <div className="absolute top-[30%] left-[10%] w-24 h-2 rounded-full bg-white/[0.04]" />
                <div className="absolute top-[45%] left-[10%] w-12 h-2 rounded-full bg-white/[0.05]" />
                <div className="absolute bottom-[20%] right-[15%] w-20 h-8 rounded bg-white/[0.04]" />
                <div className="absolute bottom-[20%] right-[15%] w-20 h-1 rounded-full bg-emerald-500/20" />
                <div className="absolute bottom-[35%] left-[25%] w-14 h-10 rounded-md border border-white/[0.06]" />
              </div>

              {/* Icon */}
              <div className="relative z-10 transform transition-transform duration-300 group-hover:scale-110">
                {item.icon}
              </div>

              {/* Hover glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>

            {/* Label */}
            <div className="px-3 py-2.5 flex items-center justify-between">
              <span className="text-white/80 text-xs sm:text-sm font-medium">
                {item.labelAr}
              </span>
              <span className="text-white/30 text-[10px] sm:text-xs font-mono uppercase tracking-wider">
                {item.label}
              </span>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
