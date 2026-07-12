'use client';

// ─── Rouaa Universal Copilot — Chat Widget (Enhanced) ──────────
// Floating chat assistant available on ALL pages for ALL locales.
// Supports: 5 languages, RTL/LTR, stock analysis, page summarization,
// smart suggestions, structured data cards, multi-turn conversation,
// living personality, memory, inline charts, voice, VLM, deep search.
// Icon: 3D wireframe brain, pulsating blue glow.

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from 'next/navigation';
// V504: parser مخصص يدوي (بدون react-markdown / remark-gfm)
// يدعم: الجداول، العناوين، bold، القوائم، code blocks، inline code، RTL
// V480: استخدم auth-store لكن مع تأجيل التهيئة (lazy)
let useAuthStoreHook: any = null;
try {
  // dynamic import لتجنب ReferenceError عند SSR
  const authModule = require('@/lib/auth-store');
  useAuthStoreHook = authModule.useAuthStore;
} catch {
  // fallback إذا فشل التحميل
  useAuthStoreHook = () => ({
    user: null,
    isAuthenticated: false,
    isGuest: true,
  });
}
import { detectStockSymbol } from '@/lib/assistant/tools';
import { renderSparkline, renderMiniCandlestick, getTrendColor } from '@/lib/assistant/chart-helpers';
import BrainIcon from './BrainIcon';
// V573: استبدال الـ parser المخصص بـ react-markdown (حل مستدام بدل regex هش)
import MarkdownRenderer from './MarkdownRenderer';
import IntelligenceOrb from './IntelligenceOrb';
import ThinkingIndicator from './ThinkingIndicator';
import ChatInput from './ChatInput';
import WelcomeScreen from './WelcomeScreen';
import { Locale, CHAT_TEXT, Message } from './chat-text';
import MessageBubble from './MessageBubble'
import T from '@/lib/unified-tokens';
import './assistant.css';

// Message interface is now exported from ./chat-text

// ─── Conversation Memory (localStorage) ────────────────────────

interface ConversationSummary {
  topic: string;
  timestamp: number;
  messageCount: number;
  lastQuery: string;
}

const MEMORY_KEY = 'rouaa_conversation_memory';
const USER_PREFS_KEY = 'rouaa_user_prefs';
const MAX_MEMORIES = 5;

function saveConversationMemory(summary: ConversationSummary) {
  try {
    const existing: ConversationSummary[] = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
    const updated = [summary, ...existing.filter(m => m.topic !== summary.topic)].slice(0, MAX_MEMORIES);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

function getConversationMemories(): ConversationSummary[] {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
  } catch { return []; }
}

interface UserPreferences {
  frequentlyAskedAssets: string[];
  preferredAnalysisType: 'technical' | 'fundamental' | 'both';
  totalQueries: number;
  lastVisit: number;
}

function getUserPrefs(): UserPreferences {
  try {
    return JSON.parse(localStorage.getItem(USER_PREFS_KEY) || 'null') || {
      frequentlyAskedAssets: [],
      preferredAnalysisType: 'both',
      totalQueries: 0,
      lastVisit: 0,
    };
  } catch {
    return { frequentlyAskedAssets: [], preferredAnalysisType: 'both', totalQueries: 0, lastVisit: 0 };
  }
}

function updateUserPrefs(query: string) {
  try {
    const prefs = getUserPrefs();
    prefs.totalQueries++;
    prefs.lastVisit = Date.now();
    // Track frequently asked assets
    const symbol = detectStockSymbol(query);
    if (symbol) {
      const existing = prefs.frequentlyAskedAssets.indexOf(symbol);
      if (existing >= 0) prefs.frequentlyAskedAssets.splice(existing, 1);
      prefs.frequentlyAskedAssets.unshift(symbol);
      prefs.frequentlyAskedAssets = prefs.frequentlyAskedAssets.slice(0, 10);
    }
    // Detect analysis type preference
    const q = query.toLowerCase();
    if (q.includes('فني') || q.includes('technic') || q.includes('téchni') || q.includes('teknik')) {
      prefs.preferredAnalysisType = 'technical';
    } else if (q.includes('أساسي') || q.includes('fundament') || q.includes('temel')) {
      prefs.preferredAnalysisType = 'fundamental';
    }
    localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

// ─── Market Pulse Types ────────────────────────────────────────

type MarketPulse = 'bullish' | 'bearish' | 'neutral' | 'loading';



// ─── Detect Locale ─────────────────────────────────────────────

function detectLocale(pathname: string): Locale {
  if (pathname.startsWith('/en')) return 'en';
  if (pathname.startsWith('/fr')) return 'fr';
  if (pathname.startsWith('/tr')) return 'tr';
  if (pathname.startsWith('/es')) return 'es';
  return 'ar';
}

// ─── Detect Query Type ────────────────────────────────────────

type QueryType = 'market' | 'news' | 'asset' | 'general';

function detectQueryType(query: string): QueryType {
  const q = query.toLowerCase();
  const marketKeywords = ['سوق', 'market', 'marché', 'piyasa', 'mercado', 'مؤشر', 'index', 'indice', 'endeks', 'índice', 'تحليل', 'analysis', 'analyse', 'analiz', 'análisis'];
  const newsKeywords = ['أخبار', 'news', 'nouvelles', 'haber', 'noticias', 'تقرير', 'report', 'rapport', 'rapor', 'informe', 'عاجل', 'breaking', 'urgent'];
  const assetKeywords = ['سهم', 'stock', 'action', 'hisse', 'acción', 'ذهب', 'gold', 'or', 'altın', 'oro', 'نفط', 'oil', 'pétrole', 'petrol', 'petróleo', 'عملة', 'currency', 'devise', 'döviz', 'moneda', 'فوركس', 'forex'];

  if (newsKeywords.some(k => q.includes(k))) return 'news';
  if (assetKeywords.some(k => q.includes(k))) return 'asset';
  if (marketKeywords.some(k => q.includes(k))) return 'market';
  return 'general';
}

// ─── Get Context-Specific Thinking Phases ──────────────────────

function getContextThinkingPhases(locale: Locale, queryType: QueryType, text: typeof CHAT_TEXT['ar']): string[] {
  switch (queryType) {
    case 'news':
      return [text.thinkingNews, text.thinkingPhases[1], text.thinkingPhases[2]];
    case 'market':
      return [text.thinkingMarket, text.thinkingPhases[1], text.thinkingPhases[2]];
    case 'asset':
      return [text.thinkingCrossRef, text.thinkingMarket, text.thinkingPhases[2]];
    default:
      return text.thinkingPhases;
  }
}

// ─── Max History ───────────────────────────────────────────────

const MAX_HISTORY = 10;

// ─── Component ─────────────────────────────────────────────────

interface AssistantChatWidgetProps {
  variant?: 'floating' | 'embedded';
  reportType?: string;
}

export default function AssistantChatWidget({ variant = 'floating', reportType }: AssistantChatWidgetProps) {
  // V480: استخدم auth-store مع تأجيل التهيئة
  const authState = useAuthStoreHook ? useAuthStoreHook() : { user: null, isAuthenticated: false, isGuest: true };
  const authUser = authState?.user ?? null;
  const isAuthenticated = authState?.isAuthenticated ?? false;
  const isGuest = authState?.isGuest ?? true;

  // V483: fallback — اقرأ userId من localStorage إذا authStore فشل
  const [fallbackUserId, setFallbackUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('roua_auth_user');
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.id) setFallbackUserId(cached.id);
      }
    } catch { /* ignore */ }
  }, []);

  const effectiveUserId = authUser?.id || fallbackUserId;
  const effectiveAuthUser = authUser || (fallbackUserId ? { id: fallbackUserId, email: '', displayName: null } : null);

  // محاكاة نفس شكل session لـ التوافق مع الكود الموجود
  const session = effectiveAuthUser ? { user: { id: effectiveAuthUser.id, email: effectiveAuthUser.email || '', name: effectiveAuthUser.displayName } } : null;
  const authStatus = isAuthenticated || effectiveUserId ? 'authenticated' : (isGuest ? 'loading' : 'unauthenticated');
  const [isOpen, setIsOpen] = useState(variant === 'embedded');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<string | null>(null);
  const [detectedSymbol, setDetectedSymbol] = useState<string | null>(null);
  const [marketPulse, setMarketPulse] = useState<MarketPulse>('loading');
  const [isRecording, setIsRecording] = useState(false);
  const [isDeepSearch, setIsDeepSearch] = useState(false);
  const [deepSearchStep, setDeepSearchStep] = useState(0);
  const [proactiveSuggestions, setProactiveSuggestions] = useState<Array<{ label: string; prompt: string }>>([]);
  const [contextSuggestions, setContextSuggestions] = useState<Array<{ label: string; prompt: string }>>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [welcomeBackTopic, setWelcomeBackTopic] = useState('');
  const [personalityComment, setPersonalityComment] = useState<string | null>(null);
  const [speakingMessageIdx, setSpeakingMessageIdx] = useState<number | null>(null);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  // ─── Chat session for logged-in users ────────────────────────
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionsList, setSessionsList] = useState<Array<{ id: string; title: string; locale: string; messageCount: number; createdAt: string; updatedAt: string }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const chatSessionIdRef = useRef<string | null>(null);

  // Sync ref with state
  useEffect(() => {
    chatSessionIdRef.current = chatSessionId;
  }, [chatSessionId]);

  // ─── V549: ارتفاع كامل من أسفل الصفحة لأعلاها ──
  // النافذة تفتح فتمتد من أسفل الصفحة (فوق FAB) إلى أعلى الصفحة
  const calcFixedHeight = () => {
    if (typeof window === 'undefined') return 600;
    // الارتفاع = كامل ارتفاع النافذة - هامش علوي 16px - هامش سفلي (FAB + safe area)
    // FAB على bottom: 1.5rem (24px) + ارتفاع FAB 56px + فجوة 8px = 88px من الأسفل
    return Math.max(400, window.innerHeight - 16 - 88);
  };
  const [panelHeight, setPanelHeight] = useState(calcFixedHeight);

  // V1031: Recalculate on window resize + after mount (in case initial calc was wrong)
  useEffect(() => {
    const update = () => setPanelHeight(calcFixedHeight());
    update(); // Force recalculation after mount
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const [isResizing, setIsResizing] = useState(false);
  const [fabReady, setFabReady] = useState(false); // true after entrance animation ends
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const headerTouchStartY = useRef(0);
  // V544: state للعرض + resize أفقي
  const [panelWidth, setPanelWidth] = useState(308);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<unknown>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingMessageIdxRef = useRef<number | null>(null);
  const pathname = usePathname();
  const locale = detectLocale(pathname);
  const text = CHAT_TEXT[locale];
  const isRtl = locale === 'ar';

  // ─── Auto-resize panel based on content ────────────────────────
  const MIN_PANEL_HEIGHT = 380;
  // Bottom offset matches CSS: calc(5.5rem + env(safe-area-inset-bottom))
  // 5.5rem = 88px + safe-area ~32px = ~120px from bottom
  const BOTTOM_OFFSET = 120;
  // Navbar: top=68px + height=52px = bottom at ~120px, plus margin = 130px top reserve
  const NAVBAR_BOTTOM_RESERVE = 130;
  // V1030: MAX_PANEL_HEIGHT = same as panelHeight — no 780 cap
  const MAX_PANEL_HEIGHT = panelHeight;

  // V1030: Auto-resize DISABLED — height is fixed from header to bottom
  useEffect(() => {
    // Fixed height — do not auto-resize based on content
    return;

    // On mobile (<640px), fill the full screen
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setPanelHeight(window.innerHeight);
      return;
    }

    // Use setTimeout (200ms throttle) instead of rAF so rapid message-content
    // updates during streaming don't trigger layout thrashing from scrollHeight
    // reads on every frame.
    const resizeTimer = setTimeout(() => {
      const container = messagesContainerRef.current;
      if (!container) return;

      // scrollHeight = actual content height
      const contentHeight = container.scrollHeight;
      // Header ~64px, Resize handle ~12px, Input area ~80px, padding/gaps ~40px
      const overhead = 200;
      const neededHeight = contentHeight + overhead;

      // Clamp: max height must never push the header off screen
      // Panel bottom = BOTTOM_OFFSET from viewport bottom, so top of panel = viewport height - BOTTOM_OFFSET
      // Header must always be visible: panel height <= viewport height - BOTTOM_OFFSET - topMargin
      const absoluteMax = window.innerHeight - BOTTOM_OFFSET - NAVBAR_BOTTOM_RESERVE;
      const effectiveMax = Math.min(MAX_PANEL_HEIGHT, absoluteMax);

      const newHeight = Math.min(effectiveMax, Math.max(MIN_PANEL_HEIGHT, neededHeight));
      setPanelHeight(prev => {
        // Only grow or shrink significantly (avoid jitter)
        if (Math.abs(newHeight - prev) > 15) return newHeight;
        return prev;
      });
    }, 200);

    return () => clearTimeout(resizeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, isOpen, isLoading, thinkingPhase, MAX_PANEL_HEIGHT]);

  // ─── Visual viewport API for keyboard handling on mobile ────────
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const handleResize = () => {
      if (window.innerWidth < 640) {
        // When keyboard is open, visualViewport.height shrinks
        setPanelHeight(viewport.height);
      }
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);
    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, [isOpen]);

  // ─── FAB entrance animation — switch to aura pulse after entrance ──
  useEffect(() => {
    const timer = setTimeout(() => setFabReady(true), 600); // match fab-enter duration
    return () => clearTimeout(timer);
  }, []);


  // ─── Swipe down to close on mobile ──────────────────────────────
  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    headerTouchStartY.current = e.touches[0].clientY;
  };
  const handleHeaderTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - headerTouchStartY.current;
    if (delta > 80) {
      setIsOpen(false);
    }
  };

  // ─── V544: Manual resize — vertical + horizontal ──────────────
  // 4 أنواع من resize handles:
  // - top: تقليل/زيادة الارتفاع من الأعلى
  // - bottom: تقليل/زيادة الارتفاع من الأسفل
  // - left: تقليل/زيادة العرض من اليسار (النافذة على اليمين)
  // - corner (top-left): تقليل/زيادة الارتفاع + العرض معاً
  const handleResizeStart = useCallback((direction: 'top' | 'bottom' | 'left' | 'corner') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    resizeStartX.current = clientX;
    resizeStartY.current = clientY;
    resizeStartWidth.current = panelWidth;
    resizeStartHeight.current = panelHeight;

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      const moveX = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const moveY = 'touches' in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
      const deltaX = moveX - resizeStartX.current;
      const deltaY = moveY - resizeStartY.current;

      // V544: النافذة على اليمين، فالسحب لليسار (deltaX < 0) يزيد العرض
      if (direction === 'left' || direction === 'corner') {
        const newW = Math.min(600, Math.max(280, resizeStartWidth.current - deltaX));
        setPanelWidth(newW);
      }

      // V544: السحب لأعلى (deltaY < 0) من top يزيد الارتفاع
      if (direction === 'top' || direction === 'corner') {
        const newH = Math.min(window.innerHeight - 32, Math.max(300, resizeStartHeight.current - deltaY));
        setPanelHeight(newH);
      }

      // V544: السحب لأسفل (deltaY > 0) من bottom يزيد الارتفاع
      if (direction === 'bottom') {
        const newH = Math.min(window.innerHeight - 32, Math.max(300, resizeStartHeight.current + deltaY));
        setPanelHeight(newH);
      }
    };

    const handleUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    const cursors: Record<string, string> = {
      top: 'ns-resize',
      bottom: 'ns-resize',
      left: 'ew-resize',
      corner: 'nwse-resize',
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = cursors[direction];
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
  }, [panelWidth, panelHeight]);

  // ─── Auto-scroll to bottom ──────────────────────────────────────
  // V1007: Previously deps were [messages, thinkingPhase] which fired on EVERY
  // stream chunk → multiple overlapping 'smooth' scroll animations that fought
  // each other and caused visible jitter. Now deps are [messages.length, thinkingPhase]
  // so the scroll only fires when a NEW message is added or the thinking phase changes.
  // During streaming, the user can still scroll up freely; the panel won't fight them.
  // We also use 'auto' (instant) instead of 'smooth' to avoid animation collisions.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, thinkingPhase]);

  // ─── Focus input when opening ───────────────────────────────────
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // ─── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K → toggle chat panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      // Escape → close panel when open
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // ─── V1042: Global event bridge ───────────────────────────────
  // Listen for `rouaa:ask` events from any component on any page.
  // This allows AI analysis buttons across the site to route through
  // the Rouaa Assistant instead of calling separate AI endpoints.
  // See: src/lib/assistant/global-bridge.ts
  // NOTE: This useEffect is defined AFTER sendMessage (below) because it
  // depends on sendMessage. The hook itself is registered here but its
  // callback closes over sendMessage which is hoisted by useCallback.
  // The actual implementation is moved below sendMessage to satisfy
  // TypeScript's block-scoped variable ordering.

  // ─── Focus trap (floating variant only) ───────────────────────────
  useEffect(() => {
    if (!isOpen || variant !== 'floating') return;

    const panel = panelRef.current;
    if (!panel) return;

    const handleTabTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    panel.addEventListener('keydown', handleTabTrap);
    return () => panel.removeEventListener('keydown', handleTabTrap);
  }, [isOpen, variant]);

  // ─── Detect stock symbol in input ───────────────────────────────
  useEffect(() => {
    if (input.trim()) {
      const symbol = detectStockSymbol(input);
      setDetectedSymbol(symbol);
    } else {
      setDetectedSymbol(null);
    }
  }, [input]);

  // ─── Load conversation memory on mount ──────────────────────────
  useEffect(() => {
    const memories = getConversationMemories();
    if (memories.length > 0) {
      setShowWelcomeBack(true);
      setWelcomeBackTopic(memories[0].topic);
      // Auto-hide welcome back after 8 seconds
      const timer = setTimeout(() => setShowWelcomeBack(false), 8000);
      return () => clearTimeout(timer);
    }
  }, []);

  // ─── Load chat history for logged-in users ──────────────────────
  useEffect(() => {
    if (!isOpen) return;
    console.log('[Chat History] Panel opened — authStatus:', authStatus, 'userId:', session?.user?.id || 'none');
    if (!session?.user?.id) return;
    const loadHistory = async () => {
      try {
        const res = await fetch('/api/assistant/history?sessionId=current', { credentials: 'include' });
        if (!res.ok) {
          console.warn('[Chat History] Load current session failed:', res.status);
          return;
        }
        const data = await res.json();
        // V536: V535 يرجع { session, messages } بدل { session: { messages } }
        // ادعم كلا البنيتين للتوافق مع الإصدارات السابقة
        const messagesArray = data.messages || data.session?.messages || [];
        if (messagesArray.length > 0) {
          const loadedMessages: Message[] = messagesArray.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.createdAt).getTime(),
            sources: m.sources,
            toolsUsed: m.toolCalls,
          }));
          setMessages(loadedMessages);
          const sessionId = data.session?.id || data.sessionId;
          if (sessionId) {
            setChatSessionId(sessionId);
            chatSessionIdRef.current = sessionId;
          }
          console.log('[Chat History] Loaded session:', sessionId, 'with', loadedMessages.length, 'messages');
        } else {
          console.log('[Chat History] No previous session found — starting fresh');
        }
      } catch (err) {
        console.error('[Chat History] Load history error:', err);
      }
    };
    loadHistory();
  }, [isOpen, session?.user?.id]);

  // ─── Load sessions list for history sidebar ──────────────────────
  const loadSessionsList = useCallback(async () => {
    if (!session?.user?.id) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/assistant/history', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        console.log('[Chat History] Sessions list loaded:', data.sessions?.length || 0, 'sessions', data.sessions?.map((s: any) => ({ id: s.id?.slice(0,8), title: s.title?.slice(0,30), count: s.messageCount })));
        if (data.sessions) {
          setSessionsList(data.sessions);
        }
      } else {
        console.warn('[Chat History] Load sessions failed:', res.status);
      }
    } catch (err) {
      console.error('[Chat History] Load sessions error:', err);
    }
    setIsLoadingHistory(false);
  }, [session?.user?.id]);

  // ─── Load a specific session ──────────────────────────────────
  const loadSession = useCallback(async (sessionId: string) => {
    if (!session?.user?.id) return;
    try {
      console.log('[Chat History] Loading session:', sessionId);
      const res = await fetch(`/api/assistant/history?sessionId=${sessionId}`, { credentials: 'include' });
      if (!res.ok) {
        console.warn('[Chat History] Load session failed:', res.status);
        return;
      }
      const data = await res.json();
      // V537: V535 يرجع { session, messages } بدل { session: { messages } }
      const messagesArray = data.messages || data.session?.messages || [];
      if (messagesArray.length > 0) {
        const loadedMessages: Message[] = messagesArray.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.createdAt).getTime(),
          sources: m.sources,
          toolsUsed: m.toolCalls,
        }));
        setMessages(loadedMessages);
        const loadedSessionId = data.session?.id || sessionId;
        setChatSessionId(loadedSessionId);
        chatSessionIdRef.current = loadedSessionId;
        setShowHistory(false);
        console.log('[Chat History] Loaded session:', loadedSessionId, 'with', loadedMessages.length, 'messages');
      } else {
        console.warn('[Chat History] Session has no messages');
      }
    } catch (err) {
      console.error('[Chat History] Load session error:', err);
    }
  }, [session?.user?.id]);

  // ─── Start new conversation ──────────────────────────────────────
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setChatSessionId(null);
    chatSessionIdRef.current = null; // Update ref immediately to avoid stale value
    setShowHistory(false);
    setInput('');
    setContextSuggestions([]);
  }, []);

  // ─── Delete a session ────────────────────────────────────────────
  const deleteSession = useCallback(async (sessionId: string) => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch(`/api/assistant/history?sessionId=${sessionId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setSessionsList(prev => prev.filter(s => s.id !== sessionId));
        // If the deleted session was the current one, clear messages
        if (chatSessionIdRef.current === sessionId) {
          setMessages([]);
          setChatSessionId(null);
          chatSessionIdRef.current = null; // Update ref immediately
        }
      }
    } catch (err) {
      console.error('[Chat History] Delete session error:', err);
    }
  }, [session?.user?.id]);

  // ─── Open history sidebar ──────────────────────────────────────────
  const openHistory = useCallback(() => {
    setShowHistory(true);
    loadSessionsList();
  }, [loadSessionsList]);

  // ─── Save message to server for logged-in users ────────────────
  const saveMessageToServer = useCallback(async (role: 'user' | 'assistant', content: string, sources?: string[], toolsUsed?: string[]) => {
    if (!session?.user?.id) return;
    try {
      const currentSessionId = chatSessionIdRef.current;
      // V537: ولّد عنواناً تلقائياً من أول رسالة مستخدم
      const autoTitle = role === 'user'
        ? content.trim().slice(0, 50) + (content.length > 50 ? '…' : '')
        : undefined;
      const res = await fetch('/api/assistant/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: currentSessionId ? 'save_message' : 'create_session',
          sessionId: currentSessionId || undefined,
          role,
          content,
          sources,
          toolsUsed,
          locale,
          title: currentSessionId ? undefined : autoTitle, // عنوان فقط عند create_session
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!currentSessionId && data.sessionId) {
          chatSessionIdRef.current = data.sessionId;
          setChatSessionId(data.sessionId);
        }
      } else {
        console.warn('[Chat History] Save failed:', res.status);
      }
    } catch {
      // network error — ignore
    }
  }, [session, locale]);

  // ─── Market pulse simulation ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    // Fetch market pulse (simplified - in production this would be a real API call)
    const fetchPulse = async () => {
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: 'market pulse status', locale, pulseOnly: true }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pulse) {
            setMarketPulse(data.pulse);
          } else {
            // Default to neutral if no pulse data
            setMarketPulse('neutral');
          }
        } else {
          setMarketPulse('neutral');
        }
      } catch {
        // Random pulse for demo (in production, real API)
        const pulses: MarketPulse[] = ['bullish', 'bearish', 'neutral'];
        setMarketPulse(pulses[Math.floor(Math.random() * pulses.length)]);
      }
    };
    fetchPulse();
    const interval = setInterval(fetchPulse, 60000);
    return () => clearInterval(interval);
  }, [isOpen, locale]);

  // ─── Proactive suggestions ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const updateSuggestions = () => {
      const suggestions: Array<{ label: string; prompt: string }> = [];
      const prefs = getUserPrefs();

      // Based on market pulse
      if (marketPulse === 'bearish') {
        suggestions.push({ label: text.proactiveUrgent, prompt: locale === 'ar' ? 'ما هي آخر أخبار النفط وتأثيرها على الأسواق؟' : 'What are the latest oil news and their market impact?' });
      }
      if (marketPulse === 'bullish' || marketPulse === 'bearish') {
        suggestions.push({ label: text.proactiveGoldMove, prompt: locale === 'ar' ? 'ما هي حركة الذهب اليوم؟' : 'What is gold doing today?' });
      }
      // V551: استبدل "تقرير اقتصادي جديد" بـ "حلل صفقاتي"
      suggestions.push({ label: '💼 ' + (locale === 'ar' ? 'حلل صفقاتي' : 'Analyze my positions'), prompt: locale === 'ar' ? 'حلل صفقاتي المفتوحة وأعطني توصيات لكل صفقة' : 'Analyze my open positions and give recommendations' });

      // Based on user interests
      if (prefs.frequentlyAskedAssets.length > 0) {
        const topAsset = prefs.frequentlyAskedAssets[0];
        suggestions.push({
          label: `${text.basedOnInterest} ${topAsset}`,
          prompt: locale === 'ar' ? `ما هي آخر تطورات ${topAsset}؟` : `What are the latest developments for ${topAsset}?`,
        });
      }

      setProactiveSuggestions(suggestions.slice(0, 3));
    };

    updateSuggestions();
    const interval = setInterval(updateSuggestions, 60000);
    return () => clearInterval(interval);
  }, [isOpen, marketPulse, locale, text]);

  // ─── Personality comment based on market pulse ──────────────────
  useEffect(() => {
    if (isOpen && marketPulse !== 'loading') {
      if (marketPulse === 'bullish') {
        setPersonalityComment(text.personalityExcited);
      } else if (marketPulse === 'bearish') {
        setPersonalityComment(text.personalityCautious);
      } else {
        setPersonalityComment(null);
      }
      const timer = setTimeout(() => setPersonalityComment(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, marketPulse, text]);

  // ─── Speech Synthesis (TTS) — Browser-first, server fallback (V600) ────
  const speakText = useCallback(async (textToSpeak: string, messageIdx?: number) => {
    // If already speaking this message, stop it
    if (speakingMessageIdxRef.current === messageIdx) {
      window.speechSynthesis?.cancel();
      setSpeakingMessageIdx(null);
      speakingMessageIdxRef.current = null;
      return;
    }

    // Stop any previous audio
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Clean text for TTS — remove emojis, markdown, HTML, tool calls
    const cleanText = textToSpeak
      .replace(/<[^>]*>/g, ' ')
      .replace(/[#*_~`]/g, '')
      .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '')
      .replace(/\[[\s\S]*?\]/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/[📊📈📉🟢🔴🟡💡🎯🔍🧠⚠️💱🔒❓📰⚖📋🔬🎤🎙️🔊✓•→─═│├┤┬┴┼🔄📏☑✅❌⬆⬇⏫⏬💹💰🏦📉📈]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText || cleanText.length < 5) return;

    // Limit text for TTS
    const ttsText = cleanText.length > 3500 ? cleanText.slice(0, 3500) + '...' : cleanText;

    // ── V600: Try browser SpeechSynthesis FIRST (more reliable, instant, no network) ──
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        const langMap: Record<Locale, string> = {
          ar: 'ar-SA', en: 'en-US', fr: 'fr-FR', tr: 'tr-TR', es: 'es-ES',
        };
        const lang = langMap[locale];
        const voices = window.speechSynthesis.getVoices();
        const langVoice = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));

        // If browser has an Arabic voice, use it directly
        if (langVoice || locale !== 'ar') {
          if (messageIdx !== undefined) {
            speakingMessageIdxRef.current = messageIdx;
            setSpeakingMessageIdx(messageIdx);
          }

          const maxChunkSize = 200;
          const chunks: string[] = [];
          let remaining = ttsText;
          while (remaining.length > 0) {
            if (remaining.length <= maxChunkSize) {
              chunks.push(remaining);
              break;
            }
            let breakIdx = remaining.lastIndexOf('.', maxChunkSize);
            if (breakIdx < 50) breakIdx = remaining.lastIndexOf(' ', maxChunkSize);
            if (breakIdx < 50) breakIdx = maxChunkSize;
            chunks.push(remaining.slice(0, breakIdx + 1));
            remaining = remaining.slice(breakIdx + 1).trim();
          }

          let chunksSpoken = 0;
          const speakChunk = (idx: number) => {
            if (idx >= chunks.length) {
              speakingMessageIdxRef.current = null;
              setSpeakingMessageIdx(null);
              return;
            }
            const utterance = new SpeechSynthesisUtterance(chunks[idx]);
            utterance.lang = lang;
            utterance.rate = locale === 'ar' ? 0.85 : 0.9;
            if (langVoice) utterance.voice = langVoice;
            utterance.onend = () => {
              chunksSpoken++;
              speakChunk(idx + 1);
            };
            utterance.onerror = () => {
              speakingMessageIdxRef.current = null;
              setSpeakingMessageIdx(null);
            };
            window.speechSynthesis.speak(utterance);
          };
          speakChunk(0);
          return; // Browser speech started successfully
        }
      } catch (browserErr: any) {
        console.warn('[TTS] Browser SpeechSynthesis failed, trying server TTS:', browserErr?.message);
      }
    }

    // ── Fallback: Server-side TTS via z-ai-web-dev-sdk ──
    try {
      setIsTTSLoading(true);
      if (messageIdx !== undefined) {
        speakingMessageIdxRef.current = messageIdx;
        setSpeakingMessageIdx(messageIdx);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/assistant/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText, locale }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn('[TTS] Server TTS failed:', res.status);
        setSpeakingMessageIdx(null);
        speakingMessageIdxRef.current = null;
        return;
      }

      const audioBlob = await res.blob();
      if (audioBlob.size < 100) {
        console.warn('[TTS] Audio blob too small:', audioBlob.size, 'bytes');
        setSpeakingMessageIdx(null);
        speakingMessageIdxRef.current = null;
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        speakingMessageIdxRef.current = null;
        setSpeakingMessageIdx(null);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        speakingMessageIdxRef.current = null;
        setSpeakingMessageIdx(null);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play().catch(() => {
        speakingMessageIdxRef.current = null;
        setSpeakingMessageIdx(null);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      });
    } catch (err: any) {
      console.error('[TTS] Error:', err?.message || err);
      setSpeakingMessageIdx(null);
      speakingMessageIdxRef.current = null;
    } finally {
      setIsTTSLoading(false);
    }
  }, [locale]); // V600: Removed speakingMessageIdx from deps — use ref instead

  // ─── Speech Recognition (STT) ───────────────────────────────────
  const toggleRecording = useCallback(() => {
    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert(text.voiceNotSupported);
      return;
    }

    if (isRecording && recognitionRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any).stop();
      setIsRecording(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognitionAPI as any)();
    const langMap: Record<Locale, string> = {
      ar: 'ar-SA', en: 'en-US', fr: 'fr-FR', tr: 'tr-TR', es: 'es-ES',
    };
    recognition.lang = langMap[locale];
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording, locale, text]);

  // ─── Image Upload Handler ───────────────────────────────────────
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      setPendingImage(result);
    };
    reader.readAsDataURL(file);
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ─── Remove pending image ───────────────────────────────────────
  const removePendingImage = useCallback(() => {
    setImagePreview(null);
    setPendingImage(null);
  }, []);

  // ─── Send Message (Enhanced) ────────────────────────────────────

  const sendMessage = useCallback(async (promptText: string, options?: { deepSearch?: boolean; imageBase64?: string }) => {
    if (!promptText.trim() || isLoading) return;

    const isDeep = options?.deepSearch || false;
    const hasImage = !!options?.imageBase64;

    const userMsg: Message = {
      role: 'user',
      content: promptText.trim(),
      stockSymbol: detectStockSymbol(promptText),
      timestamp: Date.now(),
      imageUrl: options?.imageBase64 || undefined,
      imageData: options?.imageBase64 || undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setDetectedSymbol(null);
    setImagePreview(null);
    setPendingImage(null);

    // Save user message to server for logged-in users — AWAIT to ensure session is created
    // before the assistant message save runs (avoids duplicate session creation)
    await saveMessageToServer('user', promptText.trim());

    // Update user preferences
    updateUserPrefs(promptText);

    // ── Context-specific thinking phases ──
    const queryType = detectQueryType(promptText);
    let phases: string[];

    if (isDeep) {
      phases = [text.thinkingDeep1, text.thinkingDeep2, text.thinkingDeep3, text.thinkingDeep4];
      setIsDeepSearch(true);
      setDeepSearchStep(1);
    } else if (hasImage) {
      phases = [text.thinkingImage, text.thinkingPhases[1]];
    } else {
      phases = getContextThinkingPhases(locale, queryType, text);
    }

    let phaseIndex = 0;
    setThinkingPhase(phases[0]);
    let thinkingTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const advancePhase = (idx: number) => {
      if (idx < phases.length) {
        setThinkingPhase(phases[idx]);
        if (isDeep) setDeepSearchStep(idx + 1);
        if (idx < phases.length - 1) {
          thinkingTimeoutId = setTimeout(() => advancePhase(idx + 1), 2500);
        }
      }
    };
    thinkingTimeoutId = setTimeout(() => advancePhase(1), 2500);

    const cancelThinkingTimers = () => {
      if (thinkingTimeoutId) {
        clearTimeout(thinkingTimeoutId);
        thinkingTimeoutId = null;
      }
    };

    // Add an empty assistant message
    const emptyAssistantMsg: Message = {
      role: 'assistant',
      content: '',
      sources: undefined,
      toolsUsed: undefined,
      timestamp: Date.now(),
      isDeepSearch: isDeep,
    };
    setMessages(prev => [...prev, emptyAssistantMsg]);

    // ── Set context-aware suggestions ──
    const ctxSuggestions: Array<{ label: string; prompt: string }> = [];
    ctxSuggestions.push({ label: text.contextDeepAnalysis, prompt: locale === 'ar' ? `حلل بشكل أعمق: ${promptText}` : `Deep analysis: ${promptText}` });
    if (queryType === 'asset' || queryType === 'market') {
      ctxSuggestions.push({ label: text.contextCurrencyImpact, prompt: locale === 'ar' ? `ما تأثير هذا على العملات؟` : 'What is the impact on currencies?' });
    }
    ctxSuggestions.push({ label: text.contextActiveSignals, prompt: locale === 'ar' ? 'أرني الإشارات النشطة الآن' : 'Show me active signals now' });
    setContextSuggestions(ctxSuggestions);

    // ── Track content to save to server after response completes ──
    let contentToSave: string | null = null;
    let sourcesToSave: string[] | undefined;
    let toolsToSave: string[] | undefined;

    try {
      const history = messages.slice(-MAX_HISTORY).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // ── Get conversation memory for context ──
      const conversationMemories = getConversationMemories();
      const conversationMemory = conversationMemories.map(m => m.lastQuery).slice(0, 3);

      // ── Handle image analysis via VLM API ──
      if (hasImage && options?.imageBase64) {
        cancelThinkingTimers();
        setThinkingPhase(null);
        const visionRes = await fetch('/api/assistant/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: options.imageBase64,
            message: promptText,
            locale,
          }),
        });

        if (!visionRes.ok) throw new Error('Vision API error');

        const visionData = await visionRes.json();
        cancelThinkingTimers();
        setThinkingPhase(null);
        setIsDeepSearch(false);

        const analysisContent = visionData.response || text.errorGeneric;
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: analysisContent,
            };
          }
          return updated;
        });

        // Save conversation memory
        saveConversationMemory({
          topic: promptText.slice(0, 50),
          timestamp: Date.now(),
          messageCount: 1,
          lastQuery: promptText,
        });

        // Save assistant message to server for logged-in users
        saveMessageToServer('assistant', analysisContent);

        setIsLoading(false);
        setIsDeepSearch(false);
        return;
      }

      let thinkingCleared_local = false;

      // V1010: Add AbortController with timeout to prevent indefinite hangs.
      // Deep search calls can take much longer than normal queries (multiple
      // AI round-trips, scenario generation, comparisons). Without an explicit
      // timeout the browser default (~5min) kicks in, leaving the user staring
      // at a spinning indicator with no useful error message.
      //   - Normal queries: 120s timeout (position analysis needs more time)
      //   - Deep search:    180s timeout (3min; complex multi-step pipeline)
      const REQUEST_TIMEOUT_MS = isDeep ? 180_000 : 120_000;
      const MAX_ATTEMPTS = isDeep ? 2 : 1; // Deep search gets one automatic retry

      const doFetch = async (attempt: number): Promise<Response> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch('/api/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              message: promptText.trim(),
              locale,
              history,
              pageUrl: typeof window !== 'undefined' ? window.location.href : '',
              deepSearch: isDeep,
              conversationMemory,
              userId: session?.user?.id,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return response;
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (err?.name === 'AbortError') {
            console.warn(`[Assistant] Request timed out (attempt ${attempt}/${MAX_ATTEMPTS}) after ${REQUEST_TIMEOUT_MS}ms`);
          }
          throw err;
        }
      };

      let res: Response | null = null;
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          res = await doFetch(attempt);
          // If we got a 5xx server error and this isn't the last attempt, retry
          if (!res.ok && res.status >= 500 && attempt < MAX_ATTEMPTS) {
            console.warn(`[Assistant] Server error ${res.status}, retrying (attempt ${attempt}/${MAX_ATTEMPTS})...`);
            // Small backoff before retry
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          break; // success or non-retryable error
        } catch (err: any) {
          lastError = err;
          if (attempt < MAX_ATTEMPTS) {
            console.warn(`[Assistant] Fetch failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err?.message}. Retrying...`);
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          break;
        }
      }

      if (!res) {
        // All attempts failed — surface a clearer error than "connection error"
        const isTimeout = lastError?.name === 'AbortError';
        throw new Error(isTimeout ? 'timeout' : 'connection');
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        console.error('[Assistant] API error:', res.status, errData);
        throw new Error(`API error: ${res.status}`);
      }

      // ── STREAMING: Read response progressively ──
      const isStreaming = res.headers.get('X-Stream-Mode') === 'true';

      let thinkingCleared = false;
      const clearThinkingWhenContentReady = (t: string) => {
        if (!thinkingCleared && t.trim().length > 20) {
          cancelThinkingTimers();
          setThinkingPhase(null);
          thinkingCleared = true;
        }
      };

      if (isStreaming && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';
        let metadataStr = '';

        // V1008 (Solution 3): Decouple accumulation from display.
        // Previous V1007 throttled setMessages but still bound display speed to
        // server chunk arrival rate → "bursty" rendering when server sends in batches.
        //
        // New strategy:
        //   1. accumulatedCleanRef holds the FULL cleaned text received so far.
        //      Updated once per chunk (regex runs ONCE per chunk, not per render).
        //   2. A separate display loop (setInterval 30ms) reveals the text
        //      character-by-character (~250 chars/sec) at a steady pace,
        //      independent of when chunks arrive. Looks like ChatGPT/Claude.
        //   3. When stream ends, a final flush shows everything immediately.
        //   4. clearThinkingWhenContentReady is called based on accumulated text
        //      so the thinking indicator disappears as soon as the FIRST content
        //      arrives — no more "bored waiting" feel.
        const cleanDisplayText = (raw: string): string => {
          let t = raw;
          t = t.replace(/\{[^{}]*"[a-zA-Z_]+"[\s\S]*?:[\s\S]*?[^{}]*\}/g, '');
          t = t.replace(/\{[\s\S]*?"articles"[\s\S]*?\}/g, '');
          t = t.replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '');
          t = t.replace(/\{[\s\S]*?"symbol"[\s\S]*?\}/g, '');
          t = t.replace(/\{[\s\S]*?"error"[\s\S]*?\}/g, '');
          t = t.replace(/\{[\s\S]*?"looseRelevance"[\s\S]*?\}/g, '');
          t = t.replace(/\{[\s\S]*?"data"[\s\S]*?\}/g, '');
          t = t.replace(/\{[\s\S]*?"results"[\s\S]*?\}/g, '');
          t = t.replace(/\{[\s\S]*?"query"[\s\S]*?\}/g, '');
          t = t.replace(/\[[\s\S]*?"articles"[\s\S]*?\]/g, '');
          t = t.replace(/\[[\s\S]*?"symbol"[\s\S]*?\]/g, '');
          t = t.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '');
          t = t.replace(/\[\/?TOOL_CALL\]/g, '');
          t = t.replace(/\[Tool:\s*\w+\]/g, '');
          t = t.replace(/📝\s*(بيانات مفقومة من الأدوات|Data retrieved from tools|Données récupérées des outils|Araçlardan alınan veriler|Datos recuperados de las herramientas)[:\s]*\n?/g, '');
          t = t.replace(/^[*\s]*🧠\s*(جاري التحليل|Analyzing|Analyse en cours|Analiz ediliyor|Analizando)[:\s]*.*$/gm, '');
          t = t.replace(/\bundefined\b/g, '');
          t = t.replace(/\s*\((en|fr|tr|es|de|it|pt|ru|zh|ja|ko|ar)\)\s*/g, ' ');
          t = t.replace(/\s*\[(neutral|positive|negative|bullish|bearish)\]\s*/g, ' ');
          t = t.replace(/\s*\[غير عربي[^\]]*\]\s*/g, ' ');
          t = t.replace(/\s*\[(Strategic|Technical|Economy|Earnings|Daily|Weekly|Monthly)\]\s*/g, ' ');
          t = t.replace(/\s*تأثير:\s*(low|medium|high|منخفض|متوسط|عالي)\s*/g, ' ');
          t = t.replace(/\s*impact:\s*(low|medium|high)\s*/gi, ' ');
          t = t.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g, (match) => {
            try {
              const d = new Date(match);
              return d.toLocaleDateString(isRtl ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : locale === 'es' ? 'es-ES' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(isRtl ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : locale === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' });
            } catch { return match; }
          });
          t = t.replace(/\[\s*\]/g, '');
          t = t.replace(/\{\s*\}/g, '');
          t = t.replace(/^[\s]*"[a-zA-Z_]+"[\s]*:[\s]*[^,\n]+,?$/gm, '');
          t = t.replace(/^\s*[\[\]{},]\s*$/gm, '');
          t = t.replace(/\n{3,}/g, '\n\n');
          return t;
        };

        // Refs (persist across async ticks without causing re-renders themselves)
        let accumulatedClean = '';      // full cleaned text so far
        let displayedLen = 0;           // how many chars of accumulatedClean are shown
        let displayTimer: ReturnType<typeof setInterval> | null = null;
        const DISPLAY_TICK_MS = 30;     // reveal cadence (≈33fps)
        const CHARS_PER_TICK = 8;       // ~250 chars/sec — feels alive but not slow

        const updateLastMessage = (content: string) => {
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: content || '...',
              };
            }
            return updated;
          });
        };

        const startDisplayLoop = () => {
          if (displayTimer !== null) return; // already running
          displayTimer = setInterval(() => {
            const full = accumulatedClean;
            if (displayedLen >= full.length) {
              // Nothing new to reveal yet — wait for next chunk
              return;
            }
            // V598: If content contains HTML tags, skip character-by-character
            // reveal — it breaks HTML tags (DOMPurify strips incomplete tags).
            // Instead, show the full accumulated content immediately.
            if (full.includes('<') && full.includes('>')) {
              displayedLen = full.length;
              updateLastMessage(full);
              return;
            }
            // Reveal CHARS_PER_TICK more chars, snapping to word boundary
            // so we don't cut a word in half (cleaner visual).
            let newLen = displayedLen + CHARS_PER_TICK;
            if (newLen < full.length) {
              const nextSpace = full.indexOf(' ', newLen);
              if (nextSpace !== -1 && nextSpace - newLen < 20) {
                newLen = nextSpace + 1;
              }
            } else {
              newLen = full.length;
            }
            displayedLen = newLen;
            updateLastMessage(full.slice(0, displayedLen));
          }, DISPLAY_TICK_MS);
        };

        const stopDisplayLoop = () => {
          if (displayTimer !== null) {
            clearInterval(displayTimer);
            displayTimer = null;
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulatedText += chunk;

            // Check for metadata delimiter
            const metadataDelimiter = '__ROUAA_METADATA__';
            if (accumulatedText.includes(metadataDelimiter)) {
              const parts = accumulatedText.split(metadataDelimiter);
              accumulatedText = parts[0];
              metadataStr = parts[1] || '';
            }

            // V1008: Clean ONCE per chunk (not per render). This is the key win —
            // the 30 regex passes used to run 50×/sec; now they run once per chunk.
            accumulatedClean = cleanDisplayText(accumulatedText);

            // Clear thinking indicator as soon as real content arrives
            // (not when it gets displayed — that would delay the indicator too long).
            clearThinkingWhenContentReady(accumulatedClean);

            // Start the display loop on first chunk
            if (displayTimer === null) {
              startDisplayLoop();
            }
          }

          // Stream ended — final flush.
          // Stop the loop and show everything that has arrived.
          stopDisplayLoop();
          // If the loop was lagging behind accumulated text, reveal the rest now.
          if (displayedLen < accumulatedClean.length) {
            displayedLen = accumulatedClean.length;
            updateLastMessage(accumulatedClean);
          }
        } finally {
          // Safety net: ensure the loop is always stopped, even on error/abort
          stopDisplayLoop();
        }

        // Parse metadata
        let sources: string[] | undefined;
        let toolsUsed: string[] | undefined;
        if (metadataStr) {
          try {
            const meta = JSON.parse(metadataStr.trim());
            sources = meta.sources || undefined;
            toolsUsed = meta.toolsUsed || undefined;
          } catch { /* ignore */ }
        }

        // Final cleanup — apply a stricter pass on the FINAL text only
        // (the streaming cleaner is intentionally a bit more permissive to
        // avoid over-stripping partial JSON that's still being received).
        let finalText = accumulatedText;
        finalText = finalText.replace(/\{[^{}]*"[a-zA-Z]+"[^{}]*\}/g, '');
        finalText = finalText.replace(/\{[\s\S]*?"articles"[\s\S]*?\}/g, '');
        finalText = finalText.replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '');
        finalText = finalText.replace(/\{[\s\S]*?"symbol"[\s\S]*?\}/g, '');
        finalText = finalText.replace(/\{[\s\S]*?"error"[\s\S]*?\}/g, '');
        finalText = finalText.replace(/\{[\s\S]*?"looseRelevance"[\s\S]*?\}/g, '');
        finalText = finalText.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '');
        finalText = finalText.replace(/\[Tool:\s*\w+\]/g, '');
        finalText = finalText.replace(/📝\s*(بيانات مفقومة من الأدوات|Data retrieved from tools|Données récupérées des outils|Araçlardan alınan veriler|Datos recuperados de las herramientas)[:\s]*\n?/g, '');
        finalText = finalText.replace(/\n{3,}/g, '\n\n');

        if (!thinkingCleared) {
          cancelThinkingTimers();
          setThinkingPhase(null);
          thinkingCleared = true;
        }

        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: finalText || text.errorGeneric,
              sources,
              toolsUsed,
            };
          }
          return updated;
        });
        // Track content for server save
        contentToSave = finalText || null;
        sourcesToSave = sources;
        toolsToSave = toolsUsed;
      } else {
        if (!thinkingCleared) {
          cancelThinkingTimers();
          setThinkingPhase(null);
          thinkingCleared = true;
        }
        const data = await res.json();
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: data.response || text.errorGeneric,
              sources: data.sources || undefined,
              toolsUsed: data.toolsUsed || undefined,
            };
          }
          return updated;
        });
        // Track content for server save
        contentToSave = data.response || null;
        sourcesToSave = data.sources || undefined;
        toolsToSave = data.toolsUsed || undefined;
      }

      // ── Save conversation memory ──
      saveConversationMemory({
        topic: promptText.slice(0, 50),
        timestamp: Date.now(),
        messageCount: 1,
        lastQuery: promptText,
      });

      // ── Save assistant message to server for logged-in users ──
      if (contentToSave) {
        saveMessageToServer('assistant', contentToSave, sourcesToSave, toolsToSave);
      }

    } catch (err: any) {
      cancelThinkingTimers();
      setThinkingPhase(null);
      console.error('[Assistant] Connection error:', err);

      // V1010: Distinguish timeout from generic connection error so the user
      // gets an actionable message instead of "connection error" when the real
      // issue was that deep search took too long.
      const errMsg = String(err?.message || err || '');
      const isTimeout = errMsg === 'timeout' || err?.name === 'AbortError';
      const errorMessage = isTimeout
        ? (locale === 'ar'
            ? '⏳ استغرق التحليل وقتًا أطول من المتوقع. حاول مرة أخرى — التحليل العميق يحتاج أحيانًا لوقت أطول.'
            : locale === 'fr'
              ? '⏳ L\'analyse a pris plus de temps que prévu. Réessayez — l\'analyse approfondie peut nécessiter plus de temps.'
              : locale === 'tr'
                ? '⏳ Analiz beklenenden uzun sürdü. Tekrar deneyin — derin analiz bazen daha uzun sürebilir.'
                : locale === 'es'
                  ? '⏳ El análisis tomó más tiempo del esperado. Reintente — el análisis profundo puede requerir más tiempo.'
                  : '⏳ Analysis took longer than expected. Please retry — deep analysis sometimes needs more time.')
        : text.errorConnection;

      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: errorMessage,
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      setThinkingPhase(null);
      setIsDeepSearch(false);
      setDeepSearchStep(0);
    }
  }, [isLoading, messages, locale, text, saveMessageToServer]);

  // ─── V1042: Global event bridge (implementation) ──────────────
  // Listen for `rouaa:ask` events from any component on any page.
  // This allows AI analysis buttons across the site to route through
  // the Rouaa Assistant instead of calling separate AI endpoints.
  // Defined here (after sendMessage) to satisfy TypeScript ordering.
  useEffect(() => {
    if (variant !== 'floating') return; // Only the global floating widget handles these events

    const handleAsk = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        prompt: string;
        reportType?: string;
        deepSearch?: boolean;
        openOnly?: boolean;
      };

      // Open the panel
      setIsOpen(true);

      // If openOnly, don't send a message
      if (detail.openOnly) return;

      // If there's a prompt, send it after the panel opens
      if (detail.prompt && detail.prompt.trim()) {
        // Small delay to ensure panel is rendered before sending
        setTimeout(() => {
          sendMessage(detail.prompt, { deepSearch: detail.deepSearch });
        }, 100);
      }
    };

    const handleClose = () => {
      setIsOpen(false);
    };

    window.addEventListener('rouaa:ask', handleAsk as EventListener);
    window.addEventListener('rouaa:close', handleClose as EventListener);
    return () => {
      window.removeEventListener('rouaa:ask', handleAsk as EventListener);
      window.removeEventListener('rouaa:close', handleClose as EventListener);
    };
  }, [variant, sendMessage]);

  // ─── Handle Submit ─────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, { imageBase64: pendingImage || undefined });
  };

  // ─── Handle Stock Quick Analysis ───────────────────────────────

  const handleStockQuickAnalysis = () => {
    if (detectedSymbol) {
      const prompts: Record<Locale, string> = {
        ar: `حلل سهم ${detectedSymbol} من الناحية الأساسية والفنية وأخبار اليوم`,
        en: `Analyze ${detectedSymbol} stock fundamentally, technically, and with latest news`,
        fr: `Analyse l'action ${detectedSymbol} fondamentalement, techniquement et avec les dernières nouvelles`,
        tr: `${detectedSymbol} hissesini temel, teknik ve son haberlerle analiz et`,
        es: `Analiza la acción ${detectedSymbol} fundamental, técnica y con las últimas noticias`,
      };
      sendMessage(prompts[locale]);
    }
  };

  // ─── Handle Deep Search ────────────────────────────────────────
  const handleDeepSearch = () => {
    if (!input.trim()) return;
    sendMessage(input, { deepSearch: true });
  };

  // ─── Handle Regenerate ────────────────────────────────────────
  const handleRegenerate = (messageIndex: number) => {
    // Find the user message right before this assistant message
    let userMsgIndex = messageIndex - 1;
    while (userMsgIndex >= 0 && messages[userMsgIndex].role !== 'user') {
      userMsgIndex--;
    }
    if (userMsgIndex >= 0) {
      const userContent = messages[userMsgIndex].content;
      // Remove messages from the user message onward and resend
      setMessages(prev => prev.slice(0, userMsgIndex));
      // Use a small timeout so state updates before sending
      setTimeout(() => sendMessage(userContent), 50);
    }
  };

  // ─── Handle Deepen ────────────────────────────────────────────
  // V1010: Fixed two bugs in the previous implementation:
  //   (1) The previous version ignored messageIndex entirely and sent only
  //       the literal "حلل بشكل أعمق" with no context — the AI had no idea
  //       what to deepen. This is why deep-search calls often failed.
  //   (2) When the user clicked "Deepen" multiple times (e.g. after a
  //       connection error), each click prefixed "حلل بشكل أعمق:" again,
  //       producing absurd nested prompts like:
  //         "حلل بشكل أعمق: حلل بشكل أعمق: ما هي أبرز التطورات..."
  // Now we look up the LAST user message in the conversation, strip any
  // existing deepen-prefix, and add it exactly once.
  const handleDeepen = (messageIndex: number) => {
    const deepenPrefixes: Record<Locale, string> = {
      ar: 'حلل بشكل أعمق',
      en: 'Analyze in more depth',
      fr: 'Analyse plus en profondeur',
      tr: 'Daha derinlemesine analiz et',
      es: 'Analiza más en profundidad',
    };
    const prefix = deepenPrefixes[locale];

    // Find the most recent user message at or before messageIndex
    let userIdx = messageIndex;
    if (userIdx < 0 || userIdx >= messages.length) userIdx = messages.length - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') {
      userIdx--;
    }

    let basePrompt = '';
    if (userIdx >= 0) {
      basePrompt = messages[userIdx].content.trim();
    }

    // Strip any existing deepen-prefix(es) from the base prompt to avoid
    // nesting. AI sometimes prepends the prefix to the echoed user message.
    // We strip ALL leading prefixes (handles 2+ levels of nesting too).
    const stripPrefix = (text: string): string => {
      let out = text.trim();
      // Match "prefix:" or "prefix " or "prefix: " at the start, case-insensitive
      const prefixRegex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:??\\s*`, 'i');
      while (prefixRegex.test(out)) {
        out = out.replace(prefixRegex, '').trim();
      }
      return out;
    };

    const cleanBase = stripPrefix(basePrompt);
    const finalPrompt = cleanBase ? `${prefix}: ${cleanBase}` : prefix;

    sendMessage(finalPrompt);
  };

  // ─── Render Sparkline in Chat ──────────────────────────────────
  // V1007: Wrapped in useCallback (no deps — only uses imported helpers)
  // so the function reference stays stable and MessageBubble's React.memo
  // can skip re-rendering old messages when a new chunk arrives.
  const renderInlineChart = useCallback((msg: Message) => {
    if (msg.priceData && msg.priceData.length >= 2) {
      const colors = getTrendColor(msg.priceData);
      return (
        <div className="my-2" style={{ direction: 'ltr' }}>
          <div
            dangerouslySetInnerHTML={{
              __html: renderSparkline(msg.priceData, {
                width: 160, height: 48,
                color: colors.stroke,
                fillColor: colors.fill,
                strokeWidth: 2,
              }),
            }}
          />
        </div>
      );
    }
    if (msg.candleData && msg.candleData.length > 0) {
      return (
        <div className="my-2" style={{ direction: 'ltr' }}>
          <div
            dangerouslySetInnerHTML={{
              __html: renderMiniCandlestick(msg.candleData, { width: 160, height: 56 }),
            }}
          />
        </div>
      );
    }
    return null;
  }, []);

  // ─── Render Analytical Card Content (Structured Sections) ─────
  // V1007: Wrapped in useCallback with [isRtl] dep so the function reference
  // stays stable across renders. Without this, MessageBubble (now React.memo)
  // V504: parser يدوي خالص (بدون react-markdown) — مبسط ومستقر
  // يدعم: الجداول، headings، bold، bullet/numbered lists، code blocks،
  // inline code، horizontal rules، paragraphs، RTL — كلها inline styles.
  // ─── Render content via MarkdownRenderer (V573) ─────
  // V573: استبدال الـ parser المخصص (390 سطر regex) بـ react-markdown
  // الحل المستدام: AST-based parser مع دعم GFM كامل (جداول + strikethrough + lists)
  // لا مزيد من regex الهش الذي يكسر على edge cases
  const renderContent = useCallback((content: string) => {
    return <MarkdownRenderer content={content} isRtl={isRtl} />;
  }, [isRtl]);

  // ─── Market pulse color helper ─────────────────────────────────
  const getPulseColor = () => {
    switch (marketPulse) {
      case 'bullish': return '#22C55E';
      case 'bearish': return '#EF5350';
      case 'neutral': return T.warning;
      default: return '#8A9DB2';
    }
  };

  const getPulseLabel = () => {
    switch (marketPulse) {
      case 'bullish': return text.marketPulseBullish;
      case 'bearish': return text.marketPulseBearish;
      case 'neutral': return text.marketPulseNeutral;
      default: return '';
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <>
      {/* ── RTL-specific chip animation (must be dynamic) ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .chip-slide {
          animation: ${isRtl ? 'chip-slide-rtl' : 'chip-slide-ltr'} 0.3s ease-out;
        }
      `}} />

      {/* ── Floating Action Button (floating variant only) ── */}
      {variant === 'floating' && !isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`z-[1000] rounded-full flex items-center justify-center assistant-fab ${fabReady ? 'assistant-fab-ready' : 'assistant-fab-enter'}`}
          style={{
            width: 56,
            height: 56,
            // V545: FAB دائماً على اليمين (بكل اللغات)
            right: '1.5rem',
            left: 'auto',
            bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          }}
          aria-label={text.ariaLabel}
        >
          {/* Intelligence Orb — Living Light (V513) */}
          <IntelligenceOrb size={56} />
          {/* ── Notification dot for proactive suggestions ── */}
          {proactiveSuggestions.length > 0 && (
            <div className="fab-notification-dot" />
          )}
        </button>
      )}

      {/* ── Chat Panel (Auto-resize) ── */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`rounded-2xl flex flex-col overflow-hidden ${variant === 'embedded' ? 'assistant-panel-embedded' : 'fixed z-[9999] assistant-panel assistant-panel-animate-open'}`}
          style={variant === 'embedded' ? {
            height: '500px',
            maxHeight: '500px',
          } : {
            // V549: عرض وارتفاع قابلان للتعديل + تثبيت على اليمين
            width: `${panelWidth}px`,
            height: `${panelHeight}px`,
            maxHeight: 'none',
            transition: isResizing ? 'none' : 'width 0.3s ease, height 0.3s ease',
            // V549: تثبيت على اليمين دائماً (بكل اللغات)
            right: '1rem',
            left: 'auto',
            // V549: النافذة مثبتة من الأسفل (فوق FAB)، تمتد لأعلى بكامل الارتفاع
            bottom: 'calc(1.5rem + 56px + env(safe-area-inset-bottom, 0px))',
            top: 'auto',
          }}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* ── V544: Resize Handles (top, bottom, left, corner) ── */}
          <div
            onMouseDown={handleResizeStart('top')}
            onTouchStart={handleResizeStart('top')}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
              cursor: 'ns-resize', zIndex: 10,
            }}
          />
          <div
            onMouseDown={handleResizeStart('bottom')}
            onTouchStart={handleResizeStart('bottom')}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px',
              cursor: 'ns-resize', zIndex: 10,
            }}
          />
          <div
            onMouseDown={handleResizeStart('left')}
            onTouchStart={handleResizeStart('left')}
            style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: '6px',
              cursor: 'ew-resize', zIndex: 10,
            }}
          />
          <div
            onMouseDown={handleResizeStart('corner')}
            onTouchStart={handleResizeStart('corner')}
            style={{
              position: 'absolute', top: 0, left: 0, width: '12px', height: '12px',
              cursor: 'nwse-resize', zIndex: 11,
            }}
          />
          {/* ── Header (Enhanced with market pulse) ── */}
          <div className="assistant-header px-3 py-3 flex items-center gap-2" onTouchStart={handleHeaderTouchStart} onTouchMove={handleHeaderTouchMove}>
            {/* Intelligence Orb avatar — Living Light (V513) */}
            <div className="assistant-header-avatar flex items-center justify-center rounded-xl" style={{ width: 32, height: 32, flexShrink: 0 }}>
              <IntelligenceOrb size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: '#E8EDF5' }}>{text.headerTitle}</p>
              <p className="text-[10px] truncate" style={{ color: '#8A9DB2' }}>{text.headerSubtitle}</p>
            </div>
            {/* V546: أزرار التنسيق الموحد — كلها 24×24 بفجوة 4px */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* ── New Conversation button ── */}
              {session?.user?.id && (
                <button
                  onClick={startNewConversation}
                  className="rounded-md flex items-center justify-center transition-all duration-200 hover:scale-110 hover:bg-white/5"
                  style={{ width: 24, height: 24 }}
                  aria-label={text.newConversation}
                  title={text.newConversation}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
              {/* ── Chat History button ── */}
              {session?.user?.id && (
                <button
                  onClick={openHistory}
                  className="rounded-md flex items-center justify-center transition-all duration-200 hover:scale-110 hover:bg-white/5"
                  style={{ width: 24, height: 24 }}
                  aria-label={text.chatHistory}
                  title={text.chatHistory}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </button>
              )}
              {/* V546: Online indicator removed */}
              {/* Close button (floating variant only) */}
              {variant === 'floating' && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-md flex items-center justify-center transition-all duration-200 hover:scale-110 hover:bg-red-500/10"
                  style={{ width: 24, height: 24 }}
                  aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* ── Chat History Sidebar Overlay ── */}
          {showHistory && (
            <div className="chat-history-overlay">
              <div className="chat-history-panel" dir={isRtl ? 'rtl' : 'ltr'}>
                <div className="chat-history-header">
                  <span className="chat-history-title">{text.chatHistory}</span>
                  <button onClick={() => setShowHistory(false)} className="chat-history-close" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="chat-history-list">
                  {!session?.user?.id ? (
                    <div className="chat-history-empty">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <p>{text.loginToSave}</p>
                    </div>
                  ) : isLoadingHistory ? (
                    <div className="chat-history-empty">
                      <div className="chat-history-spinner" />
                      <p>{text.loadingHistory}</p>
                    </div>
                  ) : sessionsList.length === 0 ? (
                    <div className="chat-history-empty">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <p>{text.noConversations}</p>
                    </div>
                  ) : (
                    (() => {
                      const now = new Date();
                      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      const yesterday = new Date(today.getTime() - 86400000);
                      const todaySessions = sessionsList.filter(s => new Date(s.updatedAt) >= today);
                      const yesterdaySessions = sessionsList.filter(s => { const d = new Date(s.updatedAt); return d >= yesterday && d < today; });
                      const earlierSessions = sessionsList.filter(s => new Date(s.updatedAt) < yesterday);

                      const renderGroup = (label: string, sessions: typeof sessionsList) => sessions.length > 0 && (
                        <div key={label}>
                          <div className="chat-history-group-label">{label}</div>
                          {sessions.map(s => (
                            <div
                              key={s.id}
                              className={`chat-history-item ${chatSessionId === s.id ? 'chat-history-item-active' : ''}`}
                              onClick={() => loadSession(s.id)}
                            >
                              <div className="chat-history-item-content">
                                <span className="chat-history-item-title">{s.title || (locale === 'ar' ? 'محادثة' : 'Chat')}</span>
                                <span className="chat-history-item-meta">
                                  {new Date(s.updatedAt).toLocaleTimeString(isRtl ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : locale === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <button
                                className="chat-history-item-delete"
                                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                                aria-label={text.deleteConversation}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      );

                      return (
                        <>
                          {renderGroup(text.todayLabel, todaySessions)}
                          {renderGroup(text.yesterdayLabel, yesterdaySessions)}
                          {renderGroup(text.earlierLabel, earlierSessions)}
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Messages ── */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-1 py-2 space-y-2 chat-messages"
            style={{ minHeight: '80px' }}
            role="log"
            aria-live="polite"
            aria-label="Chat messages"
          >
            {messages.length === 0 && (
              <WelcomeScreen
                isRtl={isRtl}
                locale={locale}
                text={text}
                showWelcomeBack={showWelcomeBack}
                welcomeBackTopic={welcomeBackTopic}
                personalityComment={personalityComment}
                marketPulse={marketPulse}
                proactiveSuggestions={proactiveSuggestions}
                onSendMessage={sendMessage}
                frequentlyAskedAssets={getUserPrefs().frequentlyAskedAssets}
              />
            )}
            {messages.map((msg, i) => (
              <MessageBubble
                // V1007: Stable key — use role+timestamp (each message has a unique timestamp
                // set at creation time in sendMessage). Falls back to index only if timestamp
                // is missing. Using index as key caused React to reuse the same DOM node
                // across different messages when the list grew, which defeated React.memo
                // and forced full re-renders of every message on each stream chunk.
                key={msg.timestamp ? `${msg.role}-${msg.timestamp}` : `msg-${i}`}
                msg={msg}
                index={i}
                isRtl={isRtl}
                locale={locale}
                text={text}
                speakingMessageIdx={speakingMessageIdx}
                isTTSLoading={isTTSLoading}
                isStreaming={isLoading && i === messages.length - 1 && msg.role === 'assistant' && !!msg.content}
                onSpeak={speakText}
                onRegenerate={handleRegenerate}
                onDeepen={handleDeepen}
                renderContent={renderContent}
                renderInlineChart={renderInlineChart}
              />
            ))}

            {/* ── Thinking / Loading indicator ── */}
            {isLoading && (
              <ThinkingIndicator
                isRtl={isRtl}
                text={{ thinkingPhases: text.thinkingPhases, deepSearchProgress: text.deepSearchProgress }}
                thinkingPhase={thinkingPhase}
                isDeepSearch={isDeepSearch}
                deepSearchStep={deepSearchStep}
              />
            )}

            {/* ── Context-aware suggestions after last assistant message ── */}
            {!isLoading && contextSuggestions.length > 0 && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
              <div className="flex flex-wrap gap-1.5 mt-2 chip-slide" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
                {contextSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(s.prompt)}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] context-suggestion"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Area (Enhanced) ── */}
          <ChatInput
            isRtl={isRtl}
            locale={locale}
            text={text}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            isRecording={isRecording}
            detectedSymbol={detectedSymbol}
            imagePreview={imagePreview}
            onStockQuickAnalysis={handleStockQuickAnalysis}
            onRemoveImage={removePendingImage}
            onFileUpload={handleImageUpload}
            onVoiceToggle={toggleRecording}
            onDeepSearch={handleDeepSearch}
            inputRef={inputRef}
            fileInputRef={fileInputRef}
          />
          {/* V552: Quick Hint Chips removed — were cluttering the input area */}
        </div>
      )}
    </>
  );
}
