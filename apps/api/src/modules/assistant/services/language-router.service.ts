// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Language Router Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "الموجّه اللغوي" — يصنّف 32 لغة إلى 3 طبقات (A/B/C)
// ويوجّه كل طبقة للنموذج الأنسب لها
//
// الطبقات:
//   Tier A (6 لغات): GPT-4o مباشرة — جودة ممتازة
//     ar, en, es, fr, de, ru
//
//   Tier B (12 لغة): GPT-4o + Glossary مالي — جودة جيدة جدًا
//     zh, ja, ko, tr, fa, pt, it, nl, pl, hi, vi, th
//
//   Tier C (14 لغة): Claude/Bedrock + Glossary — جودة مقبولة
//     sv, uk, ur, fil, da, no, fi, cs, hu, ro, bn, he, id, ms
//
// المبدأ: لا نعِد بدعم 32 لغة بنفس الجودة
// بل نقول بصدق: 6 ممتازة + 12 جيدة جدًا + 14 مقبولة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';

// ─── Language Tiers ──────────────────────────────────────────
export type LanguageTier = 'A' | 'B' | 'C';

export interface LanguageProfile {
  code: string;
  name: string;
  nativeName: string;
  tier: LanguageTier;
  rtl: boolean; // right-to-left
  preferredModel: string; // model name from AIOrchestrator
  fallbackModel?: string;
  glossaryAvailable: boolean;
}

// ─── 32 Languages Profiles ───────────────────────────────────
const LANGUAGE_PROFILES: Record<string, LanguageProfile> = {
  // ═══ Tier A — ممتازة (6 لغات) ═══
  ar: {
    code: 'ar', name: 'Arabic', nativeName: 'العربية',
    tier: 'A', rtl: true, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  en: {
    code: 'en', name: 'English', nativeName: 'English',
    tier: 'A', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  es: {
    code: 'es', name: 'Spanish', nativeName: 'Español',
    tier: 'A', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  fr: {
    code: 'fr', name: 'French', nativeName: 'Français',
    tier: 'A', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  de: {
    code: 'de', name: 'German', nativeName: 'Deutsch',
    tier: 'A', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  ru: {
    code: 'ru', name: 'Russian', nativeName: 'Русский',
    tier: 'A', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },

  // ═══ Tier B — جيدة جدًا (12 لغة) ═══
  zh: {
    code: 'zh', name: 'Chinese', nativeName: '中文',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'bedrock',
    glossaryAvailable: true,
  },
  ja: {
    code: 'ja', name: 'Japanese', nativeName: '日本語',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'bedrock',
    glossaryAvailable: true,
  },
  ko: {
    code: 'ko', name: 'Korean', nativeName: '한국어',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'bedrock',
    glossaryAvailable: true,
  },
  tr: {
    code: 'tr', name: 'Turkish', nativeName: 'Türkçe',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  fa: {
    code: 'fa', name: 'Persian', nativeName: 'فارسی',
    tier: 'B', rtl: true, preferredModel: 'glm', fallbackModel: 'bedrock',
    glossaryAvailable: true,
  },
  pt: {
    code: 'pt', name: 'Portuguese', nativeName: 'Português',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  it: {
    code: 'it', name: 'Italian', nativeName: 'Italiano',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  nl: {
    code: 'nl', name: 'Dutch', nativeName: 'Nederlands',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  pl: {
    code: 'pl', name: 'Polish', nativeName: 'Polski',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'groq',
    glossaryAvailable: true,
  },
  hi: {
    code: 'hi', name: 'Hindi', nativeName: 'हिन्दी',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'bedrock',
    glossaryAvailable: true,
  },
  vi: {
    code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'bedrock',
    glossaryAvailable: false,
  },
  th: {
    code: 'th', name: 'Thai', nativeName: 'ภาษาไทย',
    tier: 'B', rtl: false, preferredModel: 'glm', fallbackModel: 'bedrock',
    glossaryAvailable: false,
  },

  // ═══ Tier C — مقبولة (14 لغة) ═══
  sv: {
    code: 'sv', name: 'Swedish', nativeName: 'Svenska',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  uk: {
    code: 'uk', name: 'Ukrainian', nativeName: 'Українська',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  ur: {
    code: 'ur', name: 'Urdu', nativeName: 'اردو',
    tier: 'C', rtl: true, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  fil: {
    code: 'fil', name: 'Filipino', nativeName: 'Filipino',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  da: {
    code: 'da', name: 'Danish', nativeName: 'Dansk',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  no: {
    code: 'no', name: 'Norwegian', nativeName: 'Norsk',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  fi: {
    code: 'fi', name: 'Finnish', nativeName: 'Suomi',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  cs: {
    code: 'cs', name: 'Czech', nativeName: 'Čeština',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  hu: {
    code: 'hu', name: 'Hungarian', nativeName: 'Magyar',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  ro: {
    code: 'ro', name: 'Romanian', nativeName: 'Română',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  bn: {
    code: 'bn', name: 'Bengali', nativeName: 'বাংলা',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  he: {
    code: 'he', name: 'Hebrew', nativeName: 'עברית',
    tier: 'C', rtl: true, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  id: {
    code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
  ms: {
    code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu',
    tier: 'C', rtl: false, preferredModel: 'bedrock', fallbackModel: 'glm',
    glossaryAvailable: false,
  },
};

// ─── Default profile (fallback لغير المعروف) ────────────────
const DEFAULT_PROFILE: LanguageProfile = {
  code: 'ar',
  name: 'Arabic',
  nativeName: 'العربية',
  tier: 'A',
  rtl: true,
  preferredModel: 'glm',
  fallbackModel: 'groq',
  glossaryAvailable: true,
};

@Injectable()
export class LanguageRouterService {
  private readonly logger = new Logger(LanguageRouterService.name);

  constructor() {
    const tierA = Object.values(LANGUAGE_PROFILES).filter((p) => p.tier === 'A').length;
    const tierB = Object.values(LANGUAGE_PROFILES).filter((p) => p.tier === 'B').length;
    const tierC = Object.values(LANGUAGE_PROFILES).filter((p) => p.tier === 'C').length;
    this.logger.log(
      `🌐 LanguageRouterService initialized — ${tierA}A + ${tierB}B + ${tierC}C = ${tierA + tierB + tierC} languages`,
    );
  }

  /**
   * يرجع profile اللغة المطلوبة
   */
  getProfile(language: string): LanguageProfile {
    const normalized = (language || 'ar').toLowerCase().slice(0, 2);
    return LANGUAGE_PROFILES[normalized] ?? DEFAULT_PROFILE;
  }

  /**
   * يرجع tier اللغة
   */
  getTier(language: string): LanguageTier {
    return this.getProfile(language).tier;
  }

  /**
   * هل اللغة RTL؟
   */
  isRtl(language: string): boolean {
    return this.getProfile(language).rtl;
  }

  /**
   * يرجع النموذج المفضل للغة
   */
  getPreferredModel(language: string): string {
    return this.getProfile(language).preferredModel;
  }

  /**
   * يرجع النموذج البديل
   */
  getFallbackModel(language: string): string | undefined {
    return this.getProfile(language).fallbackModel;
  }

  /**
   * هل اللغة تدعم Glossary مالي؟
   */
  hasGlossary(language: string): boolean {
    return this.getProfile(language).glossaryAvailable;
  }

  /**
   * يرجع اسم اللغة بالإنجليزية (للـ LLM prompts)
   */
  getLanguageName(language: string): string {
    return this.getProfile(language).name;
  }

  /**
   * يرجع اسم اللغة الأصلي (للعرض)
   */
  getNativeName(language: string): string {
    return this.getProfile(language).nativeName;
  }

  /**
   * قائمة كل اللغات المدعومة (للـ admin UI)
   */
  getAllLanguages(): LanguageProfile[] {
    return Object.values(LANGUAGE_PROFILES).sort((a, b) => {
      // رتّب حسب Tier ثم الاسم
      if (a.tier !== b.tier) {
        return a.tier.localeCompare(b.tier);
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * إحصائيات التغطية
   */
  getCoverageStats(): {
    total: number;
    tierA: number;
    tierB: number;
    tierC: number;
    rtlCount: number;
    glossaryCount: number;
  } {
    const all = Object.values(LANGUAGE_PROFILES);
    return {
      total: all.length,
      tierA: all.filter((p) => p.tier === 'A').length,
      tierB: all.filter((p) => p.tier === 'B').length,
      tierC: all.filter((p) => p.tier === 'C').length,
      rtlCount: all.filter((p) => p.rtl).length,
      glossaryCount: all.filter((p) => p.glossaryAvailable).length,
    };
  }

  /**
   * يبني وسم اللغة للـ system prompt
   * مثال: "Respond in Arabic (العربية). This is a RTL language."
   */
  buildLanguageInstruction(language: string): string {
    const profile = this.getProfile(language);
    const parts: string[] = [`Respond in ${profile.name} (${profile.nativeName}).`];

    if (profile.rtl) {
      parts.push('This is a right-to-left (RTL) language — keep formatting RTL-friendly.');
    }

    if (profile.tier === 'B') {
      parts.push('Use the provided financial glossary for accurate terminology.');
    } else if (profile.tier === 'C') {
      parts.push('Use simple, clear financial terminology. Avoid idioms.');
    }

    return parts.join(' ');
  }

  /**
   * يتحقق أن اللغة مدعومة
   */
  isSupported(language: string): boolean {
    const normalized = (language || '').toLowerCase().slice(0, 2);
    return normalized in LANGUAGE_PROFILES;
  }

  /**
   * يطبع تقرير اللغات (للـ debugging)
   */
  getReport(): string {
    const all = this.getAllLanguages();
    const lines: string[] = ['═══ Language Router Report ═══'];

    lines.push('\n── Tier A (Excellent) ──');
    for (const p of all.filter((x) => x.tier === 'A')) {
      lines.push(`  ${p.code} — ${p.name} (${p.nativeName})${p.rtl ? ' [RTL]' : ''}`);
    }

    lines.push('\n── Tier B (Very Good) ──');
    for (const p of all.filter((x) => x.tier === 'B')) {
      lines.push(`  ${p.code} — ${p.name} (${p.nativeName})${p.rtl ? ' [RTL]' : ''}${p.glossaryAvailable ? ' ✓' : ''}`);
    }

    lines.push('\n── Tier C (Acceptable) ──');
    for (const p of all.filter((x) => x.tier === 'C')) {
      lines.push(`  ${p.code} — ${p.name} (${p.nativeName})${p.rtl ? ' [RTL]' : ''}`);
    }

    return lines.join('\n');
  }
}
