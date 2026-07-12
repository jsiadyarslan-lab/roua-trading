"use client";

import { motion } from "framer-motion"

export function CouncilSigil({ size = 36, animated = true }: { size?: number; animated?: boolean }) {
  const cx = 20, cy = 20, ringR = 14, nodeCount = 6;
  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const angle = (i / nodeCount) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * ringR, y: cy + Math.sin(angle) * ringR };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="council-sigil-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={'#B388FF'} /><stop offset="50%" stopColor="#6366F1" /><stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <radialGradient id="council-sigil-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={'#B388FF'} stopOpacity="0.9" /><stop offset="60%" stopColor="#6366F1" stopOpacity="0.3" /><stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.circle cx={cx} cy={cy} r={ringR} stroke="url(#council-sigil-grad)" strokeWidth="1" strokeDasharray="2 3" opacity={0.4}
        animate={animated ? { rotate: 360 } : undefined} transition={animated ? { duration: 30, repeat: Infinity, ease: "linear" } : undefined}
        style={{ transformOrigin: "center" }} />
      {nodes.map((n, i) => <line key={`line-${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="url(#council-sigil-grad)" strokeWidth="0.6" opacity={0.5} />)}
      {nodes.map((n, i) => (
        <motion.circle key={`node-${i}`} cx={n.x} cy={n.y} r="2" fill="url(#council-sigil-grad)"
          animate={animated ? { opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] } : undefined}
          transition={animated ? { duration: 2.4, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" } : undefined}
          style={{ transformOrigin: `${n.x}px ${n.y}px` }} />
      ))}
      <circle cx={cx} cy={cy} r="9" fill="url(#council-sigil-glow)" opacity={0.6} />
      <motion.circle cx={cx} cy={cy} r="3.5" fill="url(#council-sigil-grad)"
        animate={animated ? { scale: [1, 1.1, 1] } : undefined}
        transition={animated ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : undefined}
        style={{ transformOrigin: "center" }} />
      <circle cx={cx} cy={cy} r="1.2" fill={'#0B0E14'} />
    </svg>
  );
}
