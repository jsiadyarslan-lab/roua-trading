'use client';

import { motion } from 'framer-motion';

interface Testimonial {
  name: string;
  nameEn: string;
  role: string;
  roleEn: string;
  text: string;
  initials: string;
  color: string;
  borderColor: string;
  bgColor: string;
}

const testimonials: Testimonial[] = [
  {
    name: 'أحمد الشمري',
    nameEn: 'Ahmed Al-Shamri',
    role: 'متداول مستقل',
    roleEn: 'Independent Trader',
    text: 'رؤى غيّرت طريقة تحليلي للأسواق. 6 نماذج ذكاء اصطناعي تعمل معاً — هذا مستقبل التداول.',
    initials: 'أش',
    color: '#10b981',
    borderColor: 'rgba(16,185,129,0.3)',
    bgColor: 'rgba(16,185,129,0.1)',
  },
  {
    name: 'سارة العتيبي',
    nameEn: 'Sara Al-Otaibi',
    role: 'محللة مالية',
    roleEn: 'Financial Analyst',
    text: 'التحليل العربي دقيق ومتعمق. المنصة الوحيدة التي تفهم سياق الأسواق العربية.',
    initials: 'سع',
    color: '#f59e0b',
    borderColor: 'rgba(245,158,11,0.3)',
    bgColor: 'rgba(245,158,11,0.1)',
  },
  {
    name: 'محمد القحطاني',
    nameEn: 'Mohammed Al-Qahtani',
    role: 'مدير محفظة',
    roleEn: 'Portfolio Manager',
    text: 'إدارة المخاطر التلقائية والبيانات الواقعية جعلتاني أتخذ قرارات أفضل بثقة أكبر.',
    initials: 'مق',
    color: '#8b5cf6',
    borderColor: 'rgba(139,92,246,0.3)',
    bgColor: 'rgba(139,92,246,0.1)',
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export default function TestimonialsSection() {
  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6"
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
    >
      {testimonials.map((testimonial) => (
        <motion.div
          key={testimonial.nameEn}
          variants={cardVariants}
          whileHover={{ y: -4, scale: 1.01 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.07]"
        >
          {/* Avatar + Name */}
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{
                background: testimonial.bgColor,
                color: testimonial.color,
                border: `2px solid ${testimonial.borderColor}`,
              }}
            >
              {testimonial.initials}
            </div>
            <div className="min-w-0">
              <h4 className="text-white text-sm font-semibold leading-tight truncate">
                {testimonial.name}
              </h4>
              <p className="text-white/40 text-xs mt-0.5">{testimonial.role}</p>
            </div>
          </div>

          {/* Quote */}
          <div className="relative">
            <div
              className="absolute -top-1 -right-1 text-3xl leading-none opacity-10 pointer-events-none"
              style={{ color: testimonial.color }}
            >
              ❝
            </div>
            <p className="text-white/70 text-sm leading-relaxed pr-6" dir="rtl">
              {testimonial.text}
            </p>
          </div>

          {/* Star Rating */}
          <div className="flex items-center gap-0.5 mt-auto pt-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={star <= 5 ? testimonial.color : 'none'}
                stroke={testimonial.color}
                strokeWidth="1.5"
                className="opacity-60"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ))}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
