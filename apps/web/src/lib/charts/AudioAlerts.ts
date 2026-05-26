// ═══════════════════════════════════════════════════════════
// Audio Alert System — Web Speech API for high-confidence patterns
// Announces patterns vocally: "Hammer pattern detected on BTC/USDT
// with 90% confidence". Useful for multi-chart monitoring.
// ═══════════════════════════════════════════════════════════

export interface AudioAlertConfig {
  enabled: boolean;
  minConfidence: number;  // 0-1, default 0.85 (85%)
  volume: number;         // 0-1
  language: 'ar' | 'en';
  rate: number;           // Speech rate (0.5-2)
  cooldownMs: number;     // Min ms between alerts (prevent spam)
  soundEnabled: boolean;  // Play a short beep before speech
}

const DEFAULT_CONFIG: AudioAlertConfig = {
  enabled: true,
  minConfidence: 0.85,
  volume: 0.7,
  language: 'ar',
  rate: 1.0,
  cooldownMs: 10000,  // 10 seconds between alerts
  soundEnabled: true,
};

// ── Audio Context for beep sound ─────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playBeep(frequency = 880, duration = 150, volume = 0.3): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.value = volume;
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch {
    // Audio context might not be available
  }
}

// ── Pattern Alert Announcer ──────────────────────────────
export class PatternAudioAlerter {
  private config: AudioAlertConfig;
  private lastAlertAt = 0;
  private lastPatternType = '';

  constructor(config: Partial<AudioAlertConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Announce a pattern detection if it meets confidence threshold
   * @returns true if alert was played, false if skipped
   */
  announce(params: {
    patternType: string;
    patternTypeAr: string;
    symbol: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;  // 0-1
  }): boolean {
    if (!this.config.enabled) return false;
    if (params.confidence < this.config.minConfidence) return false;

    // Cooldown check
    const now = Date.now();
    if (now - this.lastAlertAt < this.config.cooldownMs) return false;

    // Same pattern type cooldown (avoid repeating same pattern)
    if (params.patternType === this.lastPatternType && now - this.lastAlertAt < this.config.cooldownMs * 2) {
      return false;
    }

    this.lastAlertAt = now;
    this.lastPatternType = params.patternType;

    // Play beep
    if (this.config.soundEnabled) {
      const freq = params.direction === 'bullish' ? 880 : params.direction === 'bearish' ? 440 : 660;
      playBeep(freq, 200, this.config.volume * 0.4);
    }

    // Speech announcement
    this._speak(params);

    return true;
  }

  /**
   * Announce a breakout alert (higher priority)
   */
  announceBreakout(params: {
    patternType: string;
    patternTypeAr: string;
    symbol: string;
    direction: 'bullish' | 'bearish';
    price: number;
  }): boolean {
    if (!this.config.enabled) return false;

    // Breakouts bypass normal cooldown but have their own (5s)
    const now = Date.now();
    if (now - this.lastAlertAt < 5000) return false;
    this.lastAlertAt = now;

    // Play urgent beep
    if (this.config.soundEnabled) {
      playBeep(1200, 100, this.config.volume * 0.5);
      setTimeout(() => playBeep(1400, 100, this.config.volume * 0.5), 150);
    }

    // Speech
    if (this.config.language === 'ar') {
      this._speakAr(`كسر ${params.patternTypeAr} ${params.direction === 'bullish' ? 'صعودي' : 'هبوطي'} على ${params.symbol}`);
    } else {
      this._speakEn(`${params.patternType} breakout ${params.direction} on ${params.symbol}`);
    }

    return true;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AudioAlertConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Test the alert system
   */
  test(): void {
    if (this.config.soundEnabled) {
      playBeep(880, 200, this.config.volume * 0.5);
    }
    this._speak({
      patternType: 'Test',
      patternTypeAr: 'اختبار',
      symbol: 'BTC/USDT',
      direction: 'bullish',
      confidence: 0.95,
    });
  }

  // ── Private ────────────────────────────────────────────

  private _speak(params: {
    patternType: string;
    patternTypeAr: string;
    symbol: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  }): void {
    if (this.config.language === 'ar') {
      const dir = params.direction === 'bullish' ? 'صعودي' : params.direction === 'bearish' ? 'هبوطي' : 'محايد';
      const conf = Math.round(params.confidence * 100);
      this._speakAr(`نمط ${params.patternTypeAr} ${dir} على ${params.symbol} بثقة ${conf} بالمئة`);
    } else {
      const conf = Math.round(params.confidence * 100);
      this._speakEn(`${params.patternType} pattern ${params.direction} on ${params.symbol} with ${conf} percent confidence`);
    }
  }

  private _speakAr(text: string): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = this.config.rate;
    utterance.volume = this.config.volume;
    window.speechSynthesis.speak(utterance);
  }

  private _speakEn(text: string): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = this.config.rate;
    utterance.volume = this.config.volume;
    window.speechSynthesis.speak(utterance);
  }
}

// ── Singleton ────────────────────────────────────────────
let _instance: PatternAudioAlerter | null = null;

export function getPatternAudioAlerter(): PatternAudioAlerter {
  if (!_instance) {
    _instance = new PatternAudioAlerter();
  }
  return _instance;
}
