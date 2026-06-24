'use client';

// ─── Welcome Screen — Extracted from AssistantChatWidget ──────────
// Renders the initial greeting, personality, suggestions, and quick actions
// shown when the chat has no messages yet.

import BrainIcon from './BrainIcon';
import { Locale, CHAT_TEXT } from './chat-text';

type MarketPulse = 'bullish' | 'bearish' | 'neutral' | 'loading';

interface WelcomeScreenProps {
  isRtl: boolean;
  locale: Locale;
  text: typeof CHAT_TEXT['ar'];
  showWelcomeBack: boolean;
  welcomeBackTopic: string;
  personalityComment: string | null;
  marketPulse: MarketPulse;
  proactiveSuggestions: Array<{ label: string; prompt: string }>;
  onSendMessage: (prompt: string) => void;
  frequentlyAskedAssets: string[];
}

// ─── Time-Based Greeting ───────────────────────────────────────

function getTimeGreeting(locale: Locale): string {
  const hour = new Date().getHours();
  const greetings: Record<Locale, { morning: string; afternoon: string; evening: string; lateNight: string }> = {
    ar: { morning: 'صباح الخير ☀️', afternoon: 'مساء النور 🌤️', evening: 'مساء الخير 🌙', lateNight: 'أهلاً بك في هذه الساعة المتأخرة 🌙' },
    en: { morning: 'Good morning ☀️', afternoon: 'Good afternoon 🌤️', evening: 'Good evening 🌙', lateNight: 'Burning the midnight oil? 🌙' },
    fr: { morning: 'Bonjour ☀️', afternoon: 'Bon après-midi 🌤️', evening: 'Bonsoir 🌙', lateNight: 'Vous travaillez tard 🌙' },
    tr: { morning: 'Günaydın ☀️', afternoon: 'İyi günler 🌤️', evening: 'İyi akşamlar 🌙', lateNight: 'Geç saatte çalışıyorsunuz 🌙' },
    es: { morning: 'Buenos días ☀️', afternoon: 'Buenas tardes 🌤️', evening: 'Buenas noches 🌙', lateNight: 'Trabajando tarde 🌙' },
  };
  const g = greetings[locale];
  if (hour >= 5 && hour < 12) return g.morning;
  if (hour >= 12 && hour < 17) return g.afternoon;
  if (hour >= 17 && hour < 22) return g.evening;
  return g.lateNight;
}

export default function WelcomeScreen({
  isRtl,
  locale,
  text,
  showWelcomeBack,
  welcomeBackTopic,
  personalityComment,
  marketPulse,
  proactiveSuggestions,
  onSendMessage,
  frequentlyAskedAssets,
}: WelcomeScreenProps) {
  return (
    <div className="text-center py-4">
      {/* Decorative brain greeting — animated glow ring */}
      <div className="flex justify-center mb-4">
        <div
          className="flex items-center justify-center rounded-2xl assistant-header-avatar"
          style={{
            width: 64,
            height: 64,
          }}
        >
          <BrainIcon size={36} color="#00E5FF" pulse={true} />
        </div>
      </div>

      {/* ── Time-based greeting ── */}
      <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
        {getTimeGreeting(locale)}
      </p>
      <p className="text-sm mb-3" style={{ color: 'var(--text2)' }}>{text.greeting}</p>

      {/* ── Welcome back message ── */}
      {showWelcomeBack && welcomeBackTopic && (
        <div
          className="mb-3 px-3 py-2 rounded-xl chip-slide welcome-chip"
        >
          <span className="text-[11px]" style={{ color: 'var(--cyan)' }}>
            {text.welcomeBack} {text.welcomeBackTopic} <strong>{welcomeBackTopic}</strong>
          </span>
        </div>
      )}

      {/* ── Personality comment ── */}
      {personalityComment && (
        <div
          className={`mb-3 px-3 py-2 rounded-xl chip-slide ${marketPulse === 'bullish' ? 'welcome-personality-bullish' : 'welcome-personality-bearish'}`}
        >
          <span className="text-[11px] font-semibold" style={{ color: marketPulse === 'bullish' ? 'var(--bull)' : 'var(--bear)' }}>
            {personalityComment}
          </span>
        </div>
      )}

      {/* ── Proactive suggestion chips ── */}
      {proactiveSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 justify-center">
          {proactiveSuggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(s.prompt)}
              className="px-2.5 py-1.5 rounded-lg text-[10px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] chip-slide proactive-chip"
              style={{
                animationDelay: `${idx * 0.1}s`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Quick actions grid ── */}
      <div className="grid grid-cols-2 gap-2">
        {text.quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onSendMessage(action.prompt)}
            className="px-3 py-2.5 rounded-xl text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] welcome-action-btn"
            style={{
              textAlign: isRtl ? 'right' : 'left',
            }}
          >
            <span className="inline-block ml-1 mr-1">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>

      {/* ── Personalized suggestion based on interests ── */}
      {frequentlyAskedAssets.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => {
              const topAsset = frequentlyAskedAssets[0];
              onSendMessage(locale === 'ar' ? `آخر تطورات ${topAsset}` : `Latest on ${topAsset}`);
            }}
            className="w-full px-3 py-2 rounded-xl text-xs transition-all duration-200 hover:scale-[1.01] welcome-interest-chip"
          >
            {text.basedOnInterest} <strong>{frequentlyAskedAssets[0]}</strong>
          </button>
        </div>
      )}
    </div>
  );
}
