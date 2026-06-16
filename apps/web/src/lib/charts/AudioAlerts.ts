// ═══════════════════════════════════════════════════════════
// Audio Alerts — Real Web Audio API Implementation
// Generates synthesized alert sounds for pattern detection
// and breakout events. No external sound files needed.
// ═══════════════════════════════════════════════════════════

export interface AudioAlerter {
  announce(opts: { patternType: string; patternTypeAr: string; symbol: string; direction: string; confidence: number }): void;
  announceBreakout(opts: { patternType: string; patternTypeAr: string; symbol: string; direction: string; price: number }): void;
}

// ── Web Audio Context (lazy init) ──────────────────────────
let audioCtx: AudioContext | null = null;
let audioEnabled = true;

function getAudioContext(): AudioContext | null {
  if (!audioEnabled) return null;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    audioEnabled = false;
    return null;
  }
}

// ── Sound Synthesis ────────────────────────────────────────

/**
 * Play a pleasant ascending chime for bullish signals.
 * Two tones: base → +major third, with smooth envelope.
 */
function playBullishSound(volume: number = 0.3): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1: Root note
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, now); // C5
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(volume, now + 0.05);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.5);

  // Tone 2: Major third (ascending feel)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
  gain2.gain.setValueAtTime(0, now + 0.12);
  gain2.gain.linearRampToValueAtTime(volume * 0.8, now + 0.17);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.6);
}

/**
 * Play a descending alert for bearish signals.
 * Two tones: base → -minor third, with smooth envelope.
 */
function playBearishSound(volume: number = 0.3): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1: Root note
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, now); // C5
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(volume, now + 0.05);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.45);

  // Tone 2: Minor third (descending feel)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(440, now + 0.12); // A4
  gain2.gain.setValueAtTime(0, now + 0.12);
  gain2.gain.linearRampToValueAtTime(volume * 0.8, now + 0.17);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.55);
}

/**
 * Play an urgent breakout alert — rapid ascending triple tone.
 * Used when a pattern breakout is detected (high priority).
 */
function playBreakoutSound(direction: 'bullish' | 'bearish', volume: number = 0.35): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const baseFreq = direction === 'bullish' ? 440 : 392; // A4 or G4

  // Three rapid ascending tones
  for (let i = 0; i < 3; i++) {
    const offset = i * 0.1;
    const freq = baseFreq * (1 + i * (direction === 'bullish' ? 0.15 : -0.12));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i === 2 ? 'triangle' : 'sine'; // Last tone brighter
    osc.frequency.setValueAtTime(freq, now + offset);
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(volume * (0.7 + i * 0.15), now + offset + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.2);
  }
}

// ── Cooldown to prevent sound spam ─────────────────────────
let lastSoundTime = 0;
const MIN_SOUND_INTERVAL = 3000; // 3 seconds between sounds

// ── Public API ─────────────────────────────────────────────

export function getPatternAudioAlerter(): AudioAlerter {
  return {
    announce(opts: { patternType: string; patternTypeAr: string; symbol: string; direction: string; confidence: number }): void {
      try {
        const now = Date.now();
        if (now - lastSoundTime < MIN_SOUND_INTERVAL) return;
        lastSoundTime = now;

        if (opts.direction === 'bullish') {
          playBullishSound(0.25 + opts.confidence * 0.1);
        } else if (opts.direction === 'bearish') {
          playBearishSound(0.25 + opts.confidence * 0.1);
        }
      } catch { /* Audio not available */ }
    },

    announceBreakout(opts: { patternType: string; patternTypeAr: string; symbol: string; direction: string; price: number }): void {
      try {
        const now = Date.now();
        // Breakouts get a shorter cooldown (2s) since they're more important
        if (now - lastSoundTime < 2000) return;
        lastSoundTime = now;

        playBreakoutSound(opts.direction as 'bullish' | 'bearish', 0.3);
      } catch { /* Audio not available */ }
    },
  };
}

/** Enable/disable audio alerts globally */
export function setAudioEnabled(enabled: boolean): void {
  audioEnabled = enabled;
  if (!enabled && audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

/** Check if audio is available */
export function isAudioAvailable(): boolean {
  return audioEnabled && typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
}
