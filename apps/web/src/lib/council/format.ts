// Formatting and utility helpers for the council dashboard UI.

export function formatPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 3, minimumFractionDigits: 2 });
  if (value >= 0.01) return value.toLocaleString("en-US", { maximumFractionDigits: 5, minimumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 5 });
}

export function riskRewardRatio(entry: number, sl: number, tp: number, direction: string): number {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return 0;
  return Math.round((reward / risk) * 100) / 100;
}

export function distancePercent(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round((Math.abs(to - from) / from) * 10000) / 100;
}

export function relativeTime(iso: string, locale: "en" | "ar"): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const isFuture = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const sec = Math.floor(absMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 45) return locale === "ar" ? "الآن" : "now";
  if (min < 60) return locale === "ar" ? `منذ ${min} د` : `${min}m ago`;
  if (hr < 24) return locale === "ar" ? `منذ ${hr} س` : `${hr}h ago`;
  return locale === "ar" ? `منذ ${day} ي` : `${day}d ago`;
}

export function msRemaining(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 ? diff : 0;
}

export function formatDuration(ms: number, locale: "en" | "ar"): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (locale === "ar") return m > 0 ? `${m} د ${s} ث` : `${s} ث`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatCountdown(ms: number, locale: "en" | "ar"): string {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (locale === "ar") {
    if (d > 0) return `${d}ي ${h}س ${m}د`;
    if (h > 0) return `${h}س ${m}د ${s}ث`;
    return `${m}د ${s}ث`;
  }
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
