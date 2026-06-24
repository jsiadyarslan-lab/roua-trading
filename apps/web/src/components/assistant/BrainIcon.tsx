'use client';

// ─── Neural Brain — Clear Lines + CSS Glow (No SVG Blur) ──

export default function BrainIcon({ size = 28, color = '#00E5FF', pulse = true }: { size?: number; color?: string; pulse?: boolean }) {
  // When pulse=true (thinking), lines are bolder and brighter
  const base = pulse ? 2.4 : 1.5;  // primary line width
  const mid = pulse ? 1.8 : 1.1;   // secondary line width  
  const fine = pulse ? 1.2 : 0.7;  // tertiary line width
  const outline = pulse ? 3.0 : 2.0; // brain outline width

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={pulse ? 'brain-neural-pulse' : ''}
    >
      {/* ══════════ BRAIN OUTLINE — Both Hemispheres ══════════ */}
      {/* Left hemisphere */}
      <path d="M50 6 C41 4, 26 8, 18 18 C10 28, 8 40, 10 52 C12 62, 16 70, 22 76 C28 82, 35 87, 42 89 C46 90, 49 91, 50 91"
        stroke={color} strokeWidth={outline} strokeLinecap="round" opacity="0.95">
        {pulse && <animate attributeName="opacity" values="0.85;1;0.85" dur="2.5s" repeatCount="indefinite" />}
      </path>
      {/* Right hemisphere */}
      <path d="M50 6 C59 4, 74 8, 82 18 C90 28, 92 40, 90 52 C88 62, 84 70, 78 76 C72 82, 65 87, 58 89 C54 90, 51 91, 50 91"
        stroke={color} strokeWidth={outline} strokeLinecap="round" opacity="0.95">
        {pulse && <animate attributeName="opacity" values="0.85;1;0.85" dur="2.7s" repeatCount="indefinite" />}
      </path>

      {/* ══════════ CENTRAL FISSURE ══════════ */}
      <path d="M50 8 L50 89" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.5 : 0.2} strokeDasharray="3 4">
        {pulse && <animate attributeName="strokeDashoffset" values="0;14" dur="2s" repeatCount="indefinite" />}
      </path>

      {/* ══════════ LEFT NEURAL PATHWAYS — Primary ══════════ */}
      <path d="M46 14 C37 11, 25 16, 18 26" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 1 : 0.7} />
      <path d="M44 26 C35 23, 22 30, 14 40" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 0.95 : 0.65} />
      <path d="M42 40 C33 37, 20 44, 12 54" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 0.9 : 0.6} />
      <path d="M40 54 C33 51, 22 58, 16 68" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 0.85 : 0.55} />

      {/* LEFT — Secondary branches */}
      <path d="M34 18 C31 23, 27 27, 22 29" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.8 : 0.5} />
      <path d="M30 32 C27 37, 23 41, 18 43" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.75 : 0.45} />
      <path d="M28 48 C25 53, 21 57, 16 59" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.7 : 0.4} />
      <path d="M32 64 C29 69, 27 73, 24 76" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.65 : 0.35} />

      {/* LEFT — Tertiary micro-branches */}
      <path d="M26 22 C24 25, 22 26, 19 25" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.6 : 0.3} />
      <path d="M22 36 C20 39, 18 40, 15 39" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.55 : 0.25} />
      <path d="M18 52 C16 55, 14 56, 11 55" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.5 : 0.2} />
      <path d="M24 70 C22 73, 20 74, 17 73" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.45 : 0.2} />

      {/* ══════════ RIGHT NEURAL PATHWAYS — Primary ══════════ */}
      <path d="M54 14 C63 11, 75 16, 82 26" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 1 : 0.7} />
      <path d="M56 26 C65 23, 78 30, 86 40" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 0.95 : 0.65} />
      <path d="M58 40 C67 37, 80 44, 88 54" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 0.9 : 0.6} />
      <path d="M60 54 C67 51, 78 58, 84 68" stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 0.85 : 0.55} />

      {/* RIGHT — Secondary branches */}
      <path d="M66 18 C69 23, 73 27, 78 29" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.8 : 0.5} />
      <path d="M70 32 C73 37, 77 41, 82 43" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.75 : 0.45} />
      <path d="M72 48 C75 53, 79 57, 84 59" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.7 : 0.4} />
      <path d="M68 64 C71 69, 73 73, 76 76" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.65 : 0.35} />

      {/* RIGHT — Tertiary micro-branches */}
      <path d="M74 22 C76 25, 78 26, 81 25" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.6 : 0.3} />
      <path d="M78 36 C80 39, 82 40, 85 39" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.55 : 0.25} />
      <path d="M82 52 C84 55, 86 56, 89 55" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.5 : 0.2} />
      <path d="M76 70 C78 73, 80 74, 83 73" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.45 : 0.2} />

      {/* ══════════ CROSS-CONNECTIONS (Corpus Callosum bridges) ══════════ */}
      <path d="M24 22 L44 20" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.7 : 0.3}>
        {pulse && <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2.2s" repeatCount="indefinite" />}
      </path>
      <path d="M20 36 L40 34" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.65 : 0.25}>
        {pulse && <animate attributeName="opacity" values="0.25;0.65;0.25" dur="2.5s" repeatCount="indefinite" />}
      </path>
      <path d="M18 50 L38 48" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.6 : 0.2}>
        {pulse && <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.8s" repeatCount="indefinite" />}
      </path>
      <path d="M22 64 L38 62" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.55 : 0.2}>
        {pulse && <animate attributeName="opacity" values="0.2;0.55;0.2" dur="3s" repeatCount="indefinite" />}
      </path>

      <path d="M76 22 L56 20" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.7 : 0.3}>
        {pulse && <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2.3s" repeatCount="indefinite" />}
      </path>
      <path d="M80 36 L60 34" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.65 : 0.25}>
        {pulse && <animate attributeName="opacity" values="0.25;0.65;0.25" dur="2.6s" repeatCount="indefinite" />}
      </path>
      <path d="M82 50 L62 48" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.6 : 0.2}>
        {pulse && <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.9s" repeatCount="indefinite" />}
      </path>
      <path d="M78 64 L62 62" stroke={color} strokeWidth={fine} strokeLinecap="round" opacity={pulse ? 0.55 : 0.2}>
        {pulse && <animate attributeName="opacity" values="0.2;0.55;0.2" dur="3.1s" repeatCount="indefinite" />}
      </path>

      {/* ══════════ CEREBELLUM ══════════ */}
      <path d="M38 87 C36 83, 40 78, 50 78 C60 78, 64 83, 62 87 C60 93, 55 97, 50 98 C45 97, 40 93, 38 87"
        stroke={color} strokeWidth={base} strokeLinecap="round" opacity={pulse ? 0.85 : 0.5} />
      <path d="M42 85 C44 83, 48 82, 50 82 C52 82, 56 83, 58 85"
        stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.65 : 0.35} />
      <path d="M40 91 C44 89, 48 88, 50 88 C52 88, 56 89, 60 91"
        stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.6 : 0.3} />

      {/* ══════════ BRAIN STEM ══════════ */}
      <path d="M47 98 L44 100" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.6 : 0.35} />
      <path d="M53 98 L56 100" stroke={color} strokeWidth={mid} strokeLinecap="round" opacity={pulse ? 0.6 : 0.35} />

      {/* ══════════ NEURAL NODES (Synapses) — Pulsing ══════════ */}
      {/* Left hemisphere nodes */}
      <circle cx="30" cy="20" r={pulse ? 2.2 : 1.5} fill={color} opacity={pulse ? 1 : 0.6}>
        {pulse && <animate attributeName="r" values="1.5;2.8;1.5" dur="1.8s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />}
      </circle>
      <circle cx="20" cy="36" r={pulse ? 2.0 : 1.3} fill={color} opacity={pulse ? 0.9 : 0.5}>
        {pulse && <animate attributeName="r" values="1.3;2.5;1.3" dur="2.1s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.1s" repeatCount="indefinite" />}
      </circle>
      <circle cx="14" cy="52" r={pulse ? 1.8 : 1.1} fill={color} opacity={pulse ? 0.8 : 0.45}>
        {pulse && <animate attributeName="r" values="1.1;2.2;1.1" dur="1.6s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.35;0.85;0.35" dur="1.6s" repeatCount="indefinite" />}
      </circle>
      <circle cx="18" cy="68" r={pulse ? 1.6 : 1.0} fill={color} opacity={pulse ? 0.75 : 0.4}>
        {pulse && <animate attributeName="r" values="1;2;1" dur="2.3s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2.3s" repeatCount="indefinite" />}
      </circle>

      {/* Right hemisphere nodes */}
      <circle cx="70" cy="20" r={pulse ? 2.2 : 1.5} fill={color} opacity={pulse ? 1 : 0.6}>
        {pulse && <animate attributeName="r" values="1.5;2.8;1.5" dur="2s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />}
      </circle>
      <circle cx="80" cy="36" r={pulse ? 2.0 : 1.3} fill={color} opacity={pulse ? 0.9 : 0.5}>
        {pulse && <animate attributeName="r" values="1.3;2.5;1.3" dur="1.9s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.9s" repeatCount="indefinite" />}
      </circle>
      <circle cx="86" cy="52" r={pulse ? 1.8 : 1.1} fill={color} opacity={pulse ? 0.8 : 0.45}>
        {pulse && <animate attributeName="r" values="1.1;2.2;1.1" dur="2.2s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.35;0.85;0.35" dur="2.2s" repeatCount="indefinite" />}
      </circle>
      <circle cx="82" cy="68" r={pulse ? 1.6 : 1.0} fill={color} opacity={pulse ? 0.75 : 0.4}>
        {pulse && <animate attributeName="r" values="1;2;1" dur="1.7s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.7s" repeatCount="indefinite" />}
      </circle>

      {/* Central hub node (Corpus Callosum) */}
      <circle cx="50" cy="38" r={pulse ? 3.0 : 2.0} fill={color} opacity="1">
        {pulse && <animate attributeName="r" values="2;3.5;2" dur="1.2s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.6;1;0.6" dur="1.2s" repeatCount="indefinite" />}
      </circle>

      {/* Inner brain nodes */}
      <circle cx="38" cy="28" r={pulse ? 1.6 : 1.0} fill={color} opacity={pulse ? 0.8 : 0.4}>
        {pulse && <animate attributeName="opacity" values="0.35;0.85;0.35" dur="2.4s" repeatCount="indefinite" />}
      </circle>
      <circle cx="62" cy="28" r={pulse ? 1.6 : 1.0} fill={color} opacity={pulse ? 0.8 : 0.4}>
        {pulse && <animate attributeName="opacity" values="0.35;0.85;0.35" dur="2.6s" repeatCount="indefinite" />}
      </circle>
      <circle cx="36" cy="50" r={pulse ? 1.4 : 0.9} fill={color} opacity={pulse ? 0.7 : 0.35}>
        {pulse && <animate attributeName="opacity" values="0.3;0.75;0.3" dur="2s" repeatCount="indefinite" />}
      </circle>
      <circle cx="64" cy="50" r={pulse ? 1.4 : 0.9} fill={color} opacity={pulse ? 0.7 : 0.35}>
        {pulse && <animate attributeName="opacity" values="0.3;0.75;0.3" dur="2.3s" repeatCount="indefinite" />}
      </circle>
      <circle cx="40" cy="66" r={pulse ? 1.3 : 0.8} fill={color} opacity={pulse ? 0.65 : 0.3}>
        {pulse && <animate attributeName="opacity" values="0.25;0.7;0.25" dur="1.9s" repeatCount="indefinite" />}
      </circle>
      <circle cx="60" cy="66" r={pulse ? 1.3 : 0.8} fill={color} opacity={pulse ? 0.65 : 0.3}>
        {pulse && <animate attributeName="opacity" values="0.25;0.7;0.25" dur="2.1s" repeatCount="indefinite" />}
      </circle>

      {/* Cerebellum nodes */}
      <circle cx="44" cy="88" r={pulse ? 1.0 : 0.7} fill={color} opacity={pulse ? 0.6 : 0.3}>
        {pulse && <animate attributeName="opacity" values="0.2;0.65;0.2" dur="1.5s" repeatCount="indefinite" />}
      </circle>
      <circle cx="56" cy="88" r={pulse ? 1.0 : 0.7} fill={color} opacity={pulse ? 0.6 : 0.3}>
        {pulse && <animate attributeName="opacity" values="0.2;0.65;0.2" dur="1.8s" repeatCount="indefinite" />}
      </circle>

      {/* ══════════ FLOWING SIGNALS — Traveling dashes ══════════ */}
      {pulse && (
        <g>
          {/* Left primary pathways signals */}
          <path d="M46 14 C37 11, 25 16, 18 26" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 50" opacity="0.8">
            <animate attributeName="strokeDashoffset" values="55;0" dur="1.8s" repeatCount="indefinite" />
          </path>
          <path d="M44 26 C35 23, 22 30, 14 40" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="5 50" opacity="0.7">
            <animate attributeName="strokeDashoffset" values="55;0" dur="2.1s" repeatCount="indefinite" />
          </path>

          {/* Right primary pathways signals */}
          <path d="M54 14 C63 11, 75 16, 82 26" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 50" opacity="0.8">
            <animate attributeName="strokeDashoffset" values="55;0" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M56 26 C65 23, 78 30, 86 40" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="5 50" opacity="0.7">
            <animate attributeName="strokeDashoffset" values="55;0" dur="2.3s" repeatCount="indefinite" />
          </path>

          {/* Cross-connection signals */}
          <path d="M24 22 L44 20" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 22" opacity="0.5">
            <animate attributeName="strokeDashoffset" values="26;0" dur="1.5s" repeatCount="indefinite" />
          </path>
          <path d="M76 22 L56 20" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 22" opacity="0.5">
            <animate attributeName="strokeDashoffset" values="26;0" dur="1.6s" repeatCount="indefinite" />
          </path>

          {/* Central vertical signal */}
          <path d="M50 10 L50 88" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray="6 40" opacity="0.4">
            <animate attributeName="strokeDashoffset" values="46;0" dur="2.5s" repeatCount="indefinite" />
          </path>
        </g>
      )}
    </svg>
  );
}
