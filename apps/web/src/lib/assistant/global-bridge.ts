// ─── Rouaa Assistant Global Bridge ─────────────────────────────
// V1042: Provides a global event-based API so any component on any page
// can ask the Rouaa Assistant to analyze something — without needing to
// import the AssistantChatWidget directly or pass props down.
//
// Usage from any component:
//
//   import { askAssistant } from '@/lib/assistant/global-bridge';
//
//   <button onClick={() => askAssistant('Analyze AAPL stock fundamentals')}>
//     AI Analysis
//   </button>
//
// The assistant panel will open automatically and send the prompt.
//
// How it works:
// 1. This module dispatches a `rouaa:ask` CustomEvent on window.
// 2. AssistantChatWidget (mounted once in root layout) listens for it.
// 3. When the event fires, the widget opens the panel and calls sendMessage().
//
// This works across ALL pages and ALL languages because the floating
// AssistantChatWidget is mounted globally in src/app/layout.tsx.

export interface AskAssistantOptions {
  /** Optional context hint (e.g., 'stock-analysis', 'news-article') */
  reportType?: string;
  /** If true, use deep search mode (slower, more thorough) */
  deepSearch?: boolean;
  /** If true, just open the panel without sending a message */
  openOnly?: boolean;
}

/**
 * Ask the Rouaa Assistant to analyze something.
 * Opens the assistant panel and auto-sends the prompt.
 *
 * @example
 * // Stock analysis button
 * <button onClick={() => askAssistant('Analyze AAPL fundamentals and technicals')}>
 *   تحليل AI
 * </button>
 *
 * @example
 * // Just open the panel
 * askAssistant('', { openOnly: true });
 */
export function askAssistant(prompt: string, options: AskAssistantOptions = {}): void {
  if (typeof window === 'undefined') return; // SSR safety

  const event = new CustomEvent('rouaa:ask', {
    detail: {
      prompt: prompt || '',
      reportType: options.reportType,
      deepSearch: options.deepSearch || false,
      openOnly: options.openOnly || false,
    },
  });
  window.dispatchEvent(event);
}

/**
 * Open the Rouaa Assistant panel without sending a message.
 */
export function openAssistant(options: { reportType?: string } = {}): void {
  askAssistant('', { ...options, openOnly: true });
}

/**
 * Close the Rouaa Assistant panel.
 */
export function closeAssistant(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('rouaa:close'));
}

// ─── Type definition for the CustomEvent detail ───────────────
export interface RouaaAskEventDetail {
  prompt: string;
  reportType?: string;
  deepSearch?: boolean;
  openOnly?: boolean;
}

declare global {
  interface WindowEventMap {
    'rouaa:ask': CustomEvent<RouaaAskEventDetail>;
    'rouaa:close': CustomEvent<void>;
  }
}
