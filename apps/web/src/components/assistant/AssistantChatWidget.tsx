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
import IntelligenceOrb from './IntelligenceOrb';
import ThinkingIndicator from './ThinkingIndicator';
import ChatInput from './ChatInput';
import WelcomeScreen from './WelcomeScreen';
import { Locale, CHAT_TEXT, Message } from './chat-text';
import MessageBubble from './MessageBubble';
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

  // ─── V1030: Fixed panel height — fills from header to bottom of page ──
  const calcFixedHeight = () => {
    if (typeof window === 'undefined') return 480;
    return Math.max(380, window.innerHeight - 130 - 88);
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

  // ─── Manual resize: drag handle ───────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeStartY.current = clientY;
    resizeStartHeight.current = panelHeight;

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      const moveY = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      // Dragging UP = bigger panel (increase height)
      const delta = resizeStartY.current - moveY;
      const newH = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, resizeStartHeight.current + delta));
      setPanelHeight(newH);
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

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
  }, [panelHeight, MAX_PANEL_HEIGHT]);

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
        if (data.session?.messages?.length > 0) {
          const loadedMessages: Message[] = data.session.messages.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.createdAt).getTime(),
            sources: m.sources,
            toolsUsed: m.toolCalls,
          }));
          setMessages(loadedMessages);
          setChatSessionId(data.session.id);
          chatSessionIdRef.current = data.session.id; // Update ref immediately
          console.log('[Chat History] Loaded session:', data.session.id, 'with', loadedMessages.length, 'messages');
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
      const res = await fetch(`/api/assistant/history?sessionId=${sessionId}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.session?.messages) {
        const loadedMessages: Message[] = data.session.messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.createdAt).getTime(),
          sources: m.sources,
          toolsUsed: m.toolCalls,
        }));
        setMessages(loadedMessages);
        setChatSessionId(data.session.id);
        chatSessionIdRef.current = data.session.id; // Update ref immediately
        setShowHistory(false);
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
      suggestions.push({ label: text.proactiveEconReport, prompt: locale === 'ar' ? 'ما هي أحدث التقارير الاقتصادية؟' : 'What are the latest economic reports?' });

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
      //   - Normal queries: 90s timeout (generous; most finish in <15s)
      //   - Deep search:    180s timeout (3min; complex multi-step pipeline)
      const REQUEST_TIMEOUT_MS = isDeep ? 180_000 : 90_000;
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
  // would re-render on every parent render because renderContent is recreated
  // each time, defeating the memoization.
  const renderContent = useCallback((content: string) => {
    try {
    // V1006: Normalize partial markdown during streaming — close unclosed tags
    // V1006: Normalize partial markdown during streaming — close unclosed tags
    // so the renderer doesn't break on incomplete ** or ## or | (tables)
    let safeContent = content;
    // Count unclosed ** markers
    const boldCount = (safeContent.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) safeContent += '**';
    // Close unclosed code fences
    const fenceCount = (safeContent.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) safeContent += '\n```';

    // V1009: Pre-processing pass — fix common AI-generated markdown quirks
    // that the line-by-line parser below cannot handle on its own.
    // All fixes are surgical regex substitutions; no content is lost.
    //
    // (a) Inline headings: "...text. ### Heading" → "...text.\n### Heading"
    //     AI often emits headings at the END of a paragraph line instead of
    //     on their own line. The heading regex (^(#{1,4})\s+) requires the
    //     heading to be at the START of a line, so without this fix the
    //     heading renders as raw text.
    //     V1033: Changed {1,3} to {1,4} so #### (h4) is also detected.
    safeContent = safeContent.replace(/([^\n])\s+(#{1,4}\s+)/g, '$1\n$2');
    //
    // (b) Heading glued to a tab-table row: "## Heading\tcell\tcell" →
    //     "## Heading\ncell\tcell". AI sometimes puts the heading and the
    //     first table row on the same line, separated by a tab. Without
    //     this fix, the heading becomes a table cell and the table starts
    //     one column late.
    safeContent = safeContent.replace(/^(#{1,3}\s+[^\n\t]*?)\t/gm, '$1\n');
    //
    // (c) Stray horizontal rules inside tab-table rows: a "---" cell is
    //     treated as a normal cell. Promote it to its own line so the
    //     horizontal-rule branch below picks it up. Also catches "---"
    //     glued to the end of a tab-row: "...\t---" → "...\n---".
    safeContent = safeContent.replace(/\t---\s*$/gm, '\n---');
    safeContent = safeContent.replace(/\t---\t/g, '\n---\n');
    //
    // (d) Orphan bullet markers: "- \nActual content" → "- Actual content".
    //     AI sometimes emits a bullet marker on its own line followed by
    //     the content on the next line. Without this fix the parser sees
    //     an empty bullet followed by a plain text line, so the bullet
    //     point is lost.
    //     V1010: Also handle the case where there's a BLANK line between
    //     the bullet marker and the content:
    //       "-\n\nActual content" → "- Actual content"
    //     The previous regex only matched a single \n; now it accepts
    //     any whitespace (including newlines) between the marker and content.
    safeContent = safeContent.replace(/^[-•]\s*\n\s*\n?([^\n])/gm, '- $1');
    //
    // (e) Normalize "• " bullet markers to "- " so the bullet branch below
    //     (which only matches "- " and "• ") handles them uniformly.
    safeContent = safeContent.replace(/^•\s+/gm, '- ');
    //
    // (f) Inline horizontal rules glued to text: "text --- text" →
    //     "text\n---\ntext". The HR branch only matches ^-{3,}$.
    safeContent = safeContent.replace(/[^\n]\s+---\s+([^\n])/g, '\n---\n$1');
    safeContent = safeContent.replace(/([^\n])\s+---\s*$/g, '$1\n---');

    const lines = safeContent.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let inTable = false;
    let tableRows: string[][] = [];
    let tableHeaders: string[] = [];

    const sectionStyles: Record<string, { bg: string; border: string; accent: string }> = {
      '🧠': { bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.25)', accent: '#8B5CF6' },
      '🔍': { bg: 'rgba(0,229,255,0.06)', border: 'rgba(0,229,255,0.25)', accent: '#00E5FF' },
      '💥': { bg: 'rgba(239,83,80,0.08)', border: 'rgba(239,68,68,0.2)', accent: '#EF5350' },
      '📊': { bg: 'rgba(139,92,246,0.06)', border: 'rgba(168,85,247,0.2)', accent: '#8B5CF6' },
      '🎯': { bg: 'rgba(34,197,94,0.08)', border: 'rgba(5,150,105,0.2)', accent: '#22C55E' },
      '📚': { bg: 'rgba(255,184,0,0.08)', border: 'rgba(251,191,36,0.2)', accent: '#FFB800' },
      '🔒': { bg: 'rgba(139,92,246,0.06)', border: 'rgba(99,102,241,0.2)', accent: '#8B5CF6' },
      '❓': { bg: 'rgba(0,229,255,0.06)', border: 'rgba(0,229,255,0.25)', accent: '#00E5FF' },
      '📈': { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', accent: '#22C55E' },
      '📰': { bg: 'rgba(255,184,0,0.08)', border: 'rgba(251,191,36,0.2)', accent: '#FFB800' },
      '⚖️': { bg: 'rgba(139,92,246,0.06)', border: 'rgba(168,85,247,0.2)', accent: '#8B5CF6' },
      '⚖': { bg: 'rgba(139,92,246,0.06)', border: 'rgba(168,85,247,0.2)', accent: '#8B5CF6' },
      '💡': { bg: 'rgba(255,184,0,0.08)', border: 'rgba(251,191,36,0.2)', accent: '#FFB800' },
      '⚠️': { bg: 'rgba(239,83,80,0.08)', border: 'rgba(239,68,68,0.15)', accent: '#EF5350' },
      '⚠': { bg: 'rgba(239,83,80,0.08)', border: 'rgba(239,68,68,0.15)', accent: '#EF5350' },
      '💱': { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', accent: '#22C55E' },
      '🟢': { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', accent: '#22C55E' },
      '🔴': { bg: 'rgba(239,83,80,0.08)', border: 'rgba(239,68,68,0.15)', accent: '#EF5350' },
      '🟡': { bg: 'rgba(255,184,0,0.08)', border: 'rgba(251,191,36,0.2)', accent: '#FFB800' },
    };

    const flushTable = () => {
      if (tableHeaders.length === 0 && tableRows.length === 0) return;
      inTable = false;
      // V517: تحسين تنسيق الجداول
      // - عمود "الاتجاه" فقط هو الذي يعرض pills (long/short/watch)
      // - عمود "السعر" أو "التغير" يستخدم .pos/.neg حسب الإشارة
      // - باقي الأعمدة نص عادي
      // تحديد فهرس عمود الاتجاه: نبحث عن "اتجاه|direction|trend" في الـ headers
      const directionColIdx = tableHeaders.findIndex(h =>
        /اتجاه|direction|trend|النوع|signal|action/i.test(h)
      );
      const priceColIdx = tableHeaders.findIndex(h =>
        /سعر|price|كم|current/i.test(h)
      );
      const changeColIdx = tableHeaders.findIndex(h =>
        /تغير|change|Δ|Δ \(24|delta/i.test(h)
      );

      elements.push(
        <div key={`table-${i}`} className="asst-tbl-wrap" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          <table className="asst-tbl">
            {tableHeaders.length > 0 && (
              <thead>
                <tr>{tableHeaders.map((h, hi) => (
                  <th key={hi} style={{ textAlign: isRtl ? 'right' : 'left', whiteSpace: 'nowrap' }}>{parseInline(h)}</th>
                ))}</tr>
              </thead>
            )}
            <tbody>{tableRows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => {
                const lower = cell.toLowerCase().trim();
                const isSymCol = ci === 0;
                const isDirectionCol = ci === directionColIdx;
                const isChangeCol = ci === changeColIdx;

                // كشف الإشارة (للأعمدة الرقمية فقط)
                const hasPlus = cell.includes('+') || cell.includes('▲') || cell.includes('🟢');
                const hasMinus = cell.includes('-') && !cell.includes('--') || cell.includes('▼') || cell.includes('🔻') || cell.includes('🔴');
                const isNumericChange = isChangeCol && /[-+]?[\d.,]+\s*%/.test(cell);

                // كشف اتجاه صريح (long/short/hold/buy/sell)
                const isBuy   = /\b(buy|long|شراء|صاعد|bullish|🟢|📈)\b/i.test(cell);
                const isSell  = /\b(sell|short|بيع|هابط|bearish|🔴|📉|🔻)\b/i.test(cell);
                const isWatch = /\b(hold|watch|انتظار|مراقبة|محايد|neutral|🟡|↔️|➡️)\b/i.test(cell);

                // تحديد العرض
                if (isDirectionCol && (isBuy || isSell || isWatch)) {
                  // عمود الاتجاه: عرض pill ملون
                  const pillClass = isBuy ? 'long' : isSell ? 'short' : 'watch';
                  const pillText = cell.replace(/📈|📉|🟡|🔴|🟢|↔️|➡️|▲|▼|🔻/g, '').trim() || (isBuy ? 'Long' : isSell ? 'Short' : 'Watch');
                  return (
                    <td key={ci} style={{ textAlign: isRtl ? 'right' : 'left' }}>
                      <span className={`asst-pill ${pillClass}`}>{parseInline(pillText)}</span>
                    </td>
                  );
                }

                // عمود التغير النسبي: تلوين حسب الإشارة
                if (isNumericChange) {
                  const isPositive = hasPlus || (!hasMinus && parseFloat(cell.replace(/[^\d.-]/g, '')) > 0);
                  return (
                    <td key={ci} style={{ textAlign: isRtl ? 'right' : 'left' }}>
                      <span className={isPositive ? 'pos' : 'neg'} style={{ fontWeight: 600 }}>{parseInline(cell)}</span>
                    </td>
                  );
                }

                // العمود الأول (الرمز): bold
                if (isSymCol) {
                  return (
                    <td key={ci} style={{ textAlign: isRtl ? 'right' : 'left' }}>
                      <span className="sym">{parseInline(cell)}</span>
                    </td>
                  );
                }

                // خلية عادية
                return (
                  <td key={ci} style={{ textAlign: isRtl ? 'right' : 'left' }}>
                    <span>{parseInline(cell)}</span>
                  </td>
                );
              })}</tr>
            ))}</tbody>
          </table>
        </div>
      );
      tableHeaders = [];
      tableRows = [];
    };

    const parseInline = (t: string): React.ReactNode[] => {
      const parts = t.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          // V515: Use var(--cyan) instead of hardcoded #00E5FF
          return <strong key={j} style={{ color: 'var(--cyan)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
        }
        // V515: Highlight numbers/percentages using var(--green) / var(--red)
        const numParts = part.split(/([+\-]?\d+\.?\d*\s*%)/g);
        if (numParts.length > 1) {
          return <span key={j}>{numParts.map((np, nj) => {
            if (/^[+\-]?\d+\.?\d*\s*%$/.test(np)) {
              const isPositive = np.startsWith('+') || (!np.startsWith('-') && parseFloat(np) > 0);
              return <span key={nj} style={{ color: isPositive ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{np}</span>;
            }
            return <span key={nj}>{np}</span>;
          })}</span>;
        }
        return <span key={j}>{part}</span>;
      });
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Filter 🧠 thinking lines
      const thinkingMatch = trimmed.match(/^[*\s]*🧠\s*(جاري التحليل|Analyzing|Analyse en cours|Analiz ediliyor|Analizando)[:\s]*.*/);
      if (thinkingMatch) { i++; continue; }

      // V515: Horizontal rule — subtle gradient divider (kept inline since no .asst-* equivalent)
      if (/^-{3,}$/.test(trimmed)) {
        elements.push(
          <div key={`hr-${i}`} className="my-2" style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.25), transparent)',
            direction: isRtl ? 'rtl' : 'ltr',
          }} />
        );
        i++; continue;
      }

      // Heading — V1033: now supports #### (h4) in addition to # ## ###
      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];

        // V515: Map emoji sections to .asst-sec color classes (cyan/purple/gold/green/red)
        // instead of inline styles. Matches observer/index.html design spec.
        const emojiToSecClass: Record<string, string> = {
          '🧠': 'purple', '🔍': 'cyan',   '💥': 'red',    '📊': 'purple',
          '🎯': 'green',  '📚': 'gold',   '🔒': 'purple', '❓': 'cyan',
          '📈': 'green',  '📰': 'gold',   '⚖️': 'purple', '⚖': 'purple',
          '💡': 'gold',   '⚠️': 'red',    '⚠': 'red',     '💱': 'green',
          '🟢': 'green',  '🔴': 'red',    '🟡': 'gold',   '🔄': 'cyan',
        };

        const firstChar = headingText.charAt(0);
        const secClass = emojiToSecClass[firstChar];
        const sectionStyle = sectionStyles[firstChar];

        if (secClass && sectionStyle) {
          const cleanTitle = headingText.replace(/^\*\*|\*\*$/g, '').trim();
          // Strip leading emoji from displayed title (it's already encoded in color)
          const titleNoEmoji = cleanTitle.replace(/^[🧠🔍💥📊🎯📚🔒❓📈📰⚖💡⚠💱🟢🔴🟡🔄]\s*/, '');
          elements.push(
            <div key={`section-heading-${i}`} className={`asst-sec ${secClass}`} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <span className="n">{level}</span>
              {parseInline(titleNoEmoji)}
            </div>
          );
          i++; continue;
        }

        // V1009: Detect emoji-number headings (1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟)
        // even WITHOUT a ## prefix. AI often emits these as plain text lines
        // like "1️⃣ السعر الحالي والاتجاه:" — without this branch they render
        // as regular body text instead of headings.
        // V1010: Changed \s+ to \s* so headings WITHOUT a space after the emoji
        // (e.g. "1️⃣السعر الحالي") are also detected. AI often omits the space.
        const emojiNumberMatch = headingText.match(/^([1-9]\uFE0F\u20E3|\u2781-\u2789]|\u2460-\u2473]|\uD83D\uDD1F])\s*(.+)/);
        // Also handle the case where the heading itself (no ## prefix) is just an emoji-number line
        const directEmojiNumberMatch = !emojiNumberMatch && trimmed.match(/^([1-9]\uFE0F\u20E3)\s*(.+)/);
        if (emojiNumberMatch || directEmojiNumberMatch) {
          const numText = (emojiNumberMatch || directEmojiNumberMatch)![1];
          const titleText = (emojiNumberMatch || directEmojiNumberMatch)![2];
          // Skip if title is empty (just the emoji-number alone on a line)
          if (!titleText || !titleText.trim()) {
            // Fall through to regular heading rendering
          } else {
            // V515: Render emoji-number headings as .asst-sec.cyan with the number in .n
            const numDigit = numText.charAt(0);
            elements.push(
              <div key={`emoji-heading-${i}`} className="asst-sec cyan" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
                <span className="n">{numDigit}</span>
                {parseInline(titleText.replace(/\*\*/g, ''))}
              </div>
            );
            i++; continue;
          }
        }

        // V515: Plain heading (no emoji) — render as .asst-sec.cyan too, with the level as the number
        elements.push(
          <div key={`heading-${i}`} className="asst-sec cyan" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
            <span className="n">{level}</span>
            {parseInline(headingText.replace(/\*\*/g, ''))}
          </div>
        );
        i++; continue;
      }

      // V1009: Detect emoji-number headings WITHOUT any ## prefix.
      // Pattern: "1️⃣ السعر الحالي والاتجاه:" at the start of a line.
      // The branch above only triggers when there's a ## prefix; this one
      // catches the bare-emoji-number case.
      // V1010: Changed \s+ to \s* so "1️⃣السعر" (no space) is also detected.
      // V515: Render as .asst-sec.cyan with the digit in .n
      const bareEmojiNumberMatch = trimmed.match(/^([1-9]\uFE0F\u20E3)\s*(.+)/);
      if (bareEmojiNumberMatch) {
        const numText = bareEmojiNumberMatch[1];
        const titleText = bareEmojiNumberMatch[2];
        // Only render as heading if there's actual title text
        if (titleText && titleText.trim()) {
          const numDigit = numText.charAt(0);
          elements.push(
            <div key={`bare-emoji-heading-${i}`} className="asst-sec cyan" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
              <span className="n">{numDigit}</span>
              {parseInline(titleText.replace(/\*\*/g, ''))}
            </div>
          );
          i++; continue;
        }
      }

      // V515: Blockquote — render as .asst-alert.info (matches design spec)
      if (trimmed.startsWith('> ')) {
        const quoteContent = trimmed.replace(/^>\s*/, '');
        elements.push(
          <div key={`quote-${i}`} className="asst-alert info" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
            <div className="asst-alert-ic">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--cyan)' }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <div className="asst-alert-body">
              <div className="asst-alert-d">{parseInline(quoteContent)}</div>
            </div>
          </div>
        );
        i++; continue;
      }

      // V519: Table detection — require look-ahead to avoid false positives.
      // A single pipe line with no following pipe/separator line is NOT a table.
      // Prevents AI's broken "heading | col1 | col2 |" from rendering as garbage.
      const isPipeTable = trimmed.includes('|') && trimmed.split('|').length >= 3;
      const isTabTable = trimmed.includes('\t') && trimmed.split('\t').length >= 3;
      const isTableSeparator = /^[|\s\-:]+$/.test(trimmed) && trimmed.includes('-');

      if (isTableSeparator && inTable) {
        i++; continue; // separator line inside table, skip
      }

      if (isPipeTable && !isTableSeparator) {
        if (inTable) {
          // Already in table — this is a data row
          const cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
          tableRows.push(cells);
          i++; continue;
        }
        // Not in table — look ahead to confirm it's a real table
        const nextLine = (lines[i + 1] || '').trim();
        const nextIsPipe = nextLine.includes('|') && nextLine.split('|').length >= 3;
        const nextIsSep = /^[|\s\-:]+$/.test(nextLine) && nextLine.includes('-');
        if (nextIsPipe || nextIsSep) {
          inTable = true;
          tableHeaders = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
          i++; continue;
        }
        // Single pipe line, no following pipe line → NOT a table. Fall through.
      } else if (isTabTable) {
        if (inTable) {
          const cells = trimmed.split('\t').map(c => c.trim()).filter(c => c.length > 0);
          tableRows.push(cells);
          i++; continue;
        }
        const nextLine = (lines[i + 1] || '').trim();
        const nextIsTab = nextLine.includes('\t') && nextLine.split('\t').length >= 3;
        if (nextIsTab) {
          inTable = true;
          tableHeaders = trimmed.split('\t').map(c => c.trim()).filter(c => c.length > 0);
          i++; continue;
        }
        // Single tab line → fall through.
      } else if (inTable) {
        flushTable();
      }

      // V515: Section header (emoji + bold) — render as .asst-sec with mapped color class
      const sectionMatch = trimmed.match(/^\*\*([🧠🔍💥📊🎯📚🔒❓📈📰⚖💡⚠️💱🟢🔴🟡🔄📏][^*]+)\*\*:?\s*$/);
      if (sectionMatch) {
        const sectionTitle = sectionMatch[1];
        const emoji = sectionTitle.charAt(0);
        // V515: Map emoji → .asst-sec color class
        const emojiToSecClass: Record<string, string> = {
          '🧠': 'purple', '🔍': 'cyan',   '💥': 'red',    '📊': 'purple',
          '🎯': 'green',  '📚': 'gold',   '🔒': 'purple', '❓': 'cyan',
          '📈': 'green',  '📰': 'gold',   '⚖️': 'purple', '⚖': 'purple',
          '💡': 'gold',   '⚠️': 'red',    '⚠': 'red',     '💱': 'green',
          '🟢': 'green',  '🔴': 'red',    '🟡': 'gold',   '🔄': 'cyan',
          '📏': 'cyan',
        };
        const secClass = emojiToSecClass[emoji] || 'cyan';
        const titleNoEmoji = sectionTitle.replace(/^[🧠🔍💥📊🎯📚🔒❓📈📰⚖💡⚠💱🟢🔴🟡🔄📏]\s*/, '');
        elements.push(
          <div key={`section-${i}`} className={`asst-sec ${secClass}`} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
            <span className="n">§</span>
            {parseInline(titleNoEmoji)}
          </div>
        );
        i++; continue;
      }

      // V1011 (Phase 2): Scenario probability bar — visualizes "🟢 السيناريو الصعودي: ... الاحتمال: 40%"
      // as a colored progress bar instead of plain text. Catches both Arabic and English
      // patterns, with or without a bullet prefix.
      // V515: Uses var(--green) / var(--gold) / var(--red) instead of hardcoded hex.
      // Pattern examples matched:
      //   "🟢 السيناريو الصعودي: إذا استعاد... قد يصل إلى $4,500، الاحتمال: 40%"
      //   "- 🟡 السيناريو المحايد: ... الاحتمال: 30%"
      //   "🟢 Bullish scenario: ... Probability: 40%"
      const scenarioMatch = trimmed.match(/^[-•]?\s*(🟢|🟡|🔴)\s+(.+?)[,،]?\s*(?:الاحتمال|Probability|Probabilité|Olasılık|Probabilidad)[:\s]*(\d+)\s*%/);
      if (scenarioMatch) {
        const emoji = scenarioMatch[1];
        const desc = scenarioMatch[2].trim();
        const pct = parseInt(scenarioMatch[3]);
        const color = emoji === '🟢' ? 'var(--green)' : emoji === '🟡' ? 'var(--gold)' : 'var(--red)';
        const bgColor = emoji === '🟢' ? 'rgba(34,197,94,0.08)' : emoji === '🟡' ? 'rgba(255,184,0,0.08)' : 'rgba(239,83,80,0.08)';
        elements.push(
          <div key={`scenario-${i}`} className="my-1.5 px-3 py-2 rounded-lg" style={{
            background: bgColor,
            border: `1px solid ${color}33`,
            direction: isRtl ? 'rtl' : 'ltr',
          }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span style={{ color, fontSize: '11px', fontWeight: 700, flex: 1 }}>
                <span style={{ marginLeft: '4px' }}>{emoji}</span>
                {parseInline(desc.replace(/\*\*/g, ''))}
              </span>
              <span style={{ color, fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{pct}%</span>
            </div>
            <div style={{ width: '100%', height: '5px', background: '#111828', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                borderRadius: '3px',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        );
        i++; continue;
      }

      // V1011 (Phase 2): Price card — combines "السعر الحالي" + "التغير اليومي" + "الاتجاه"
      // bullets into one unified card. AI often emits these as 3 consecutive bullets:
      //   • السعر الحالي: $4,361.4
      //   • التغير اليومي: +0.23%
      //   • الاتجاه العام: صاعد
      // We detect the first one, look ahead for the next 2, and render as a single card.
      // Falls through to normal bullet rendering if look-ahead fails.
      const priceStartMatch = trimmed.match(/^[-•]?\s*\*?\*?(?:السعر\s+الحالي|Current\s+Price|Prix\s+actuel|Güncel\s+Fiyat|Precio\s+actual)\*?\*?\s*[:：]\s*(.+)$/i);
      if (priceStartMatch && i + 2 < lines.length) {
        const currentPrice = priceStartMatch[1].trim();
        // Look ahead for change + trend (allow 1-3 lines)
        let changeLine: string | null = null;
        let trendLine: string | null = null;
        let consumedExtra = 0;
        for (let look = i + 1; look < Math.min(i + 4, lines.length) && (!changeLine || !trendLine); look++) {
          const lookTrim = lines[look].trim();
          if (!changeLine) {
            const cm = lookTrim.match(/^[-•]?\s*\*?\*?(?:التغير\s+اليومي|Daily\s+Change|Variation\s+quotidienne|Günlük\s+Değişim|Cambio\s+diario)\*?\*?\s*[:：]\s*(.+)$/i);
            if (cm) { changeLine = cm[1].trim(); consumedExtra = Math.max(consumedExtra, look - i); continue; }
          }
          if (!trendLine) {
            const tm = lookTrim.match(/^[-•]?\s*\*?\*?(?:الاتجاه\s+(?:العام)?|Trend|Direction|Yön|Tendencia)\*?\*?\s*[:：]\s*(.+)$/i);
            if (tm) { trendLine = tm[1].trim(); consumedExtra = Math.max(consumedExtra, look - i); continue; }
          }
        }
        if (changeLine && trendLine) {
          // Parse change percentage to determine color
          const changeMatch = changeLine.match(/([+\-−]?\d+\.?\d*\s*%|[-+]?\d+\.?\d*\s*%)/);
          const isUp = changeMatch ? !changeMatch[1].startsWith('-') && !changeMatch[1].startsWith('−') : false;
          const trendColor = isUp ? '#22C55E' : '#EF5350';
          const trendBg = isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,83,80,0.08)';

          elements.push(
            <div key={`price-card-${i}`} className="my-2 px-3 py-2.5 rounded-lg" style={{
              background: '#0C1220',
              border: `1px solid ${trendColor}33`,
              direction: isRtl ? 'rtl' : 'ltr',
            }}>
              <div className="flex items-center justify-between gap-3" style={{ flexWrap: 'wrap' }}>
                <div className="flex items-baseline gap-2">
                  <span style={{ color: '#8A9DB2', fontSize: '10px', fontWeight: 600 }}>
                    {isRtl ? 'السعر' : 'Price'}
                  </span>
                  <span style={{ color: '#E8EDF5', fontSize: '18px', fontWeight: 700 }}>
                    {parseInline(currentPrice.replace(/\*\*/g, ''))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{
                    color: trendColor,
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    background: trendBg,
                    borderRadius: '6px',
                  }}>
                    {isUp ? '▲' : '▼'} {parseInline(changeLine.replace(/\*\*/g, ''))}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#8A9DB2' }}>
                <span style={{ fontWeight: 600, color: '#B0C4D8' }}>
                  {isRtl ? 'الاتجاه' : 'Trend'}:
                </span>{' '}
                <span style={{ color: trendColor, fontWeight: 600 }}>
                  {parseInline(trendLine.replace(/\*\*/g, ''))}
                </span>
              </div>
            </div>
          );
          i += consumedExtra + 1;
          continue;
        }
        // If look-ahead failed, fall through to regular bullet rendering
      }

      // V1011 (Phase 2): Recommendation card — combines "نقطة الدخول" + "نقطة الخروج" + "وقف الخسارة"
      // bullets into one prominent card with BUY/SELL/HOLD color coding.
      // Pattern detection: bullet starting with "نقطة الدخول" or "Entry Point".
      const entryMatch = trimmed.match(/^[-•]?\s*\*?\*?(?:نقطة\s+الدخول|Entry\s+Point|Point\s+d'entrée|Giriş\s+Noktası|Punto\s+de\s+entrada)\*?\*?\s*[:：]\s*(.+)$/i);
      if (entryMatch && i + 1 < lines.length) {
        const entry = entryMatch[1].trim();
        let exitLine: string | null = null;
        let stopLine: string | null = null;
        let reasonLine: string | null = null;
        let consumedExtra = 0;
        for (let look = i + 1; look < Math.min(i + 5, lines.length); look++) {
          const lookTrim = lines[look].trim();
          if (!exitLine) {
            const em = lookTrim.match(/^[-•]?\s*\*?\*?(?:نقطة\s+الخروج|Exit\s+Point|Point\s+de\s+sortie|Çıkış\s+Noktası|Punto\s+de\s+salida)\*?\*?\s*[:：]\s*(.+)$/i);
            if (em) { exitLine = em[1].trim(); consumedExtra = Math.max(consumedExtra, look - i); continue; }
          }
          if (!stopLine) {
            const sm = lookTrim.match(/^[-•]?\s*\*?\*?(?:وقف\s+الخسارة|Stop\s+Loss|Stop-loss|Stop\s+perte|Zarar\s+Durdur|Stop\s+pérdida)\*?\*?\s*[:：]\s*(.+)$/i);
            if (sm) { stopLine = sm[1].trim(); consumedExtra = Math.max(consumedExtra, look - i); continue; }
          }
          if (!reasonLine) {
            const rm = lookTrim.match(/^[-•]?\s*\*?\*?(?:السبب|Reason|Raison|Sebep|Razón)\*?\*?\s*[:：]\s*(.+)$/i);
            if (rm) { reasonLine = rm[1].trim(); consumedExtra = Math.max(consumedExtra, look - i); continue; }
          }
        }
        if (exitLine) {
          // Try to determine BUY / SELL / HOLD from reason text (default BUY for entry/exit pattern)
          const reasonText = (reasonLine || '').toLowerCase();
          const isSell = reasonText.includes('بيع') || reasonText.includes('sell') || reasonText.includes('short');
          const isHold = reasonText.includes('انتظر') || reasonText.includes('hold') || reasonText.includes('wait');
          const actionLabel = isSell ? (isRtl ? 'توصية بيع' : 'SELL') : isHold ? (isRtl ? 'انتظار' : 'HOLD') : (isRtl ? 'توصية شراء' : 'BUY');
          const actionColor = isSell ? '#EF5350' : isHold ? '#FFB800' : '#22C55E';
          const actionBg = isSell ? 'rgba(239,83,80,0.08)' : isHold ? 'rgba(255,184,0,0.08)' : 'rgba(34,197,94,0.08)';

          elements.push(
            <div key={`rec-card-${i}`} className="my-2 rounded-lg overflow-hidden" style={{
              background: '#0C1220',
              border: `1px solid ${actionColor}44`,
              direction: isRtl ? 'rtl' : 'ltr',
            }}>
              {/* Action header bar */}
              <div style={{
                background: actionBg,
                padding: '6px 12px',
                borderBottom: `1px solid ${actionColor}33`,
              }}>
                <span style={{ color: actionColor, fontWeight: 700, fontSize: '12px' }}>
                  🎯 {actionLabel}
                </span>
              </div>
              {/* Entry / Exit / Stop grid */}
              <div className="grid grid-cols-3 gap-2 p-2.5" style={{ fontSize: '11px' }}>
                <div>
                  <div style={{ color: '#8A9DB2', fontSize: '9px', fontWeight: 600, marginBottom: '2px' }}>
                    {isRtl ? 'الدخول' : 'Entry'}
                  </div>
                  <div style={{ color: '#E8EDF5', fontWeight: 700, fontSize: '12px' }}>
                    {parseInline(entry.replace(/\*\*/g, ''))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#8A9DB2', fontSize: '9px', fontWeight: 600, marginBottom: '2px' }}>
                    {isRtl ? 'الخروج' : 'Target'}
                  </div>
                  <div style={{ color: '#22C55E', fontWeight: 700, fontSize: '12px' }}>
                    {parseInline(exitLine.replace(/\*\*/g, ''))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#8A9DB2', fontSize: '9px', fontWeight: 600, marginBottom: '2px' }}>
                    {isRtl ? 'وقف الخسارة' : 'Stop'}
                  </div>
                  <div style={{ color: '#EF5350', fontWeight: 700, fontSize: '12px' }}>
                    {stopLine ? parseInline(stopLine.replace(/\*\*/g, '')) : '—'}
                  </div>
                </div>
              </div>
              {reasonLine && (
                <div style={{ padding: '4px 12px 8px', fontSize: '10px', color: '#B0C4D8', lineHeight: 1.5 }}>
                  <span style={{ color: '#8A9DB2', fontWeight: 600 }}>{isRtl ? 'السبب: ' : 'Reason: '}</span>
                  {parseInline(reasonLine.replace(/\*\*/g, ''))}
                </div>
              )}
            </div>
          );
          i += consumedExtra + 1;
          continue;
        }
        // If look-ahead failed, fall through to regular bullet rendering
      }

      // V1011 (Phase 2): Confidence meter — improved to catch more patterns.
      // Previous regex required "ثقة ... %" or "Confidence ... %" on the same line.
      // Now also catches:
      //   "درجة الثقة: 60%"
      //   "Confidence level: 60%"
      //   "مستوى الثقة 60%"
      //   "confidence: 60%"
      const confMatch = trimmed.match(/(?:ثقة|درجة\s+الثقة|مستوى\s+الثقة|confidence(?:\s+level)?|confiance|güven|confianza)\s*[:：]?\s*(\d+)\s*%/i);
      if (confMatch) {
        const pct = parseInt(confMatch[1]);
        const barColor = pct >= 75 ? '#22C55E' : pct >= 50 ? '#FFB800' : '#EF5350';
        const label = isRtl
          ? (pct >= 75 ? 'ثقة عالية' : pct >= 50 ? 'ثقة متوسطة' : 'ثقة منخفضة')
          : (pct >= 75 ? 'High confidence' : pct >= 50 ? 'Medium confidence' : 'Low confidence');
        elements.push(
          <div key={`conf-${i}`} className="my-2 px-3 py-2 rounded-lg" style={{
            background: 'rgba(139,92,246,0.06)',
            border: '1px solid rgba(99,102,241,0.15)',
            direction: isRtl ? 'rtl' : 'ltr',
          }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span style={{ color: '#8B5CF6', fontSize: '11px', fontWeight: 600 }}>
                {isRtl ? '📊 مستوى الثقة' : '📊 Confidence Level'}
              </span>
              <span style={{ color: barColor, fontSize: '11px', fontWeight: 700 }}>
                {label} · {pct}%
              </span>
            </div>
            <div style={{ width: '100%', height: '6px', background: '#111828', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${barColor}, ${barColor}88)`, borderRadius: '3px', transition: 'width 0.5s ease' }} />
            </div>
          </div>
        );
        i++; continue;
      }

      // Recommendation line
      if ((trimmed.includes('توصية') || trimmed.includes('Recommendation') || trimmed.includes('Recommandation') || trimmed.includes('Tavsiye') || trimmed.includes('Recomendación') || trimmed.includes('التوصية') || trimmed.includes('Tavsiyesi') || trimmed.includes('Recomendación unificada'))
          && !/^[**]?[🎯📊⚖]/.test(trimmed)) {
        elements.push(
          <div key={`rec-${i}`} className="my-1.5 px-3 py-2 rounded-lg" style={{
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(5,150,105,0.25)',
            direction: isRtl ? 'rtl' : 'ltr',
          }}>
            {parseInline(trimmed)}
          </div>
        );
        i++; continue;
      }

      // Empty line
      if (trimmed.length === 0) { i++; continue; }

      // V515: Bullet points — uses .asst-content styling conventions
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        const bulletContent = trimmed.replace(/^[-•]\s+/, '');
        elements.push(
          <div key={`bullet-${i}`} className="flex gap-1.5 asst-content-li" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
            <span style={{ color: 'var(--cyan)', marginTop: '2px', fontSize: '13px' }}>&#x2022;</span>
            <span style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.6, flex: 1 }}>{parseInline(bulletContent)}</span>
          </div>
        );
        i++; continue;
      }

      // V517: Sub-bullet points
      if (/^\s{2,}[-•]\s/.test(line)) {
        const bulletContent = line.trim().replace(/^[-•]\s+/, '');
        elements.push(
          <div key={`sub-bullet-${i}`} className="flex gap-1.5" style={{ direction: isRtl ? 'rtl' : 'ltr', paddingLeft: isRtl ? '0' : '16px', paddingRight: isRtl ? '16px' : '0' }}>
            <span style={{ color: 'var(--text3)', marginTop: '2px', fontSize: '10px' }}>&#x25E6;</span>
            <span style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, flex: 1 }}>{parseInline(bulletContent)}</span>
          </div>
        );
        i++; continue;
      }

      // V517: Regular line — دمج الأسطر المتتالية في فقرة واحدة
      // (كانت كل سطر div مستقل مما يسبب تفتتاً بصرياً)
      // نجمع الأسطر المتتالية حتى نصل لعنصر خاص (bullet/heading/table)
      const paragraphLines: string[] = [trimmed];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();
        if (nextTrimmed.length === 0) break;
        // توقف عند أنماط خاصة
        if (/^#{1,4}\s/.test(nextTrimmed)) break;
        if (/^[-•]\s/.test(nextTrimmed)) break;
        if (/^\s{2,}[-•]\s/.test(nextLine)) break;
        if (nextTrimmed.startsWith('> ')) break;
        if (/^-{3,}$/.test(nextTrimmed)) break;
        // V519: Only break on pipe lines that start a REAL table (followed by
        // another pipe/separator line). Single pipe lines are merged into paragraph.
        if (nextTrimmed.includes('|') && nextTrimmed.split('|').length >= 3) {
          const afterNext = (lines[j + 1] || '').trim();
          const afterIsPipe = afterNext.includes('|') && afterNext.split('|').length >= 3;
          const afterIsSep = /^[|\s\-:]+$/.test(afterNext) && afterNext.includes('-');
          if (afterIsPipe || afterIsSep) break;
        }
        if (nextTrimmed.includes('\t') && nextTrimmed.split('\t').length >= 3) {
          const afterNext = (lines[j + 1] || '').trim();
          const afterIsTab = afterNext.includes('\t') && afterNext.split('\t').length >= 3;
          if (afterIsTab) break;
        }
        if (/^\*\*[🧠🔍💥📊🎯📚🔒❓📈📰⚖💡⚠💱🟢🔴🟡🔄📏]/.test(nextTrimmed)) break;
        paragraphLines.push(nextTrimmed);
        j++;
      }
      const paragraphText = paragraphLines.join(' ');
      elements.push(
        <p key={`line-${i}`} style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text)', direction: isRtl ? 'rtl' : 'ltr', margin: '0 0 8px 0' }}>
          {parseInline(paragraphText)}
        </p>
      );
      i = j; continue;
    }

    if (inTable) flushTable();

    return <>{elements}</>;
    } catch (err) {
      console.error('[renderContent] Error:', err);
      return <div style={{ whiteSpace: 'pre-wrap', color: '#D1D5DB' }}>{content}</div>;
    }
  }, [isRtl]);
  // ─── Market pulse color helper ─────────────────────────────────
  const getPulseColor = () => {
    switch (marketPulse) {
      case 'bullish': return '#22C55E';
      case 'bearish': return '#EF5350';
      case 'neutral': return '#FFB800';
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
            [isRtl ? 'left' : 'right']: '1.5rem',
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
            width: 'min(440px, calc(100vw - 48px))',
            height: `${panelHeight}px`,
            maxHeight: `${MAX_PANEL_HEIGHT}px`,
            transition: isResizing ? 'none' : 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
            top: 'auto',
            // Ensure panel never goes above the navbar area (navbar bottom ≈ 130px)
            ...(typeof window !== 'undefined' && (window.innerHeight - BOTTOM_OFFSET - panelHeight < NAVBAR_BOTTOM_RESERVE)
              ? { top: `${NAVBAR_BOTTOM_RESERVE}px`, bottom: 'auto' }
              : {}),
            [isRtl ? 'left' : 'right']: '1.5rem',
          }}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* ── Resize Handle (top edge) ── */}
          <div
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            className="resize-handle"
          >
            <div className="resize-handle-bar" />
          </div>
          {/* ── Header (Enhanced with market pulse) ── */}
          <div className="assistant-header px-5 py-4 flex items-center gap-3" onTouchStart={handleHeaderTouchStart} onTouchMove={handleHeaderTouchMove}>
            {/* Intelligence Orb avatar — Living Light (V513) */}
            <div className="assistant-header-avatar flex items-center justify-center rounded-xl" style={{ width: 40, height: 40 }}>
              <IntelligenceOrb size={36} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#E8EDF5' }}>{text.headerTitle}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs truncate" style={{ color: '#8A9DB2' }}>{text.headerSubtitle}</p>
              </div>
            </div>
            {/* Status indicator + Market pulse + History/New/Close buttons */}
            <div className="flex items-center gap-2">
              {/* ── Market Pulse Indicator (floating variant only) ── */}
              {variant === 'floating' && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md pulse-badge-${marketPulse}`}>
                  <div className={`rounded-full pulse-dot-${marketPulse}`} style={{ width: 6, height: 6 }} />
                  <span className={`text-[9px] font-medium pulse-${marketPulse}`}>
                    {getPulseLabel()}
                  </span>
                </div>
              )}
              {/* ── New Conversation button ── */}
              {session?.user?.id && messages.length > 0 && (
                <button
                  onClick={startNewConversation}
                  className="rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 chat-header-btn"
                  style={{ width: 28, height: 28 }}
                  aria-label={text.newConversation}
                  title={text.newConversation}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
              {/* ── Chat History button (logged-in users only) ── */}
              {session?.user?.id && (
                <button
                  onClick={openHistory}
                  className="rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 chat-header-btn"
                  style={{ width: 28, height: 28 }}
                  aria-label={text.chatHistory}
                  title={text.chatHistory}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </button>
              )}
              {/* Online indicator */}
              <div className="flex items-center gap-1.5">
                <div className="assistant-online-dot" style={{ width: 7, height: 7 }} />
                <span className="text-[10px] hidden sm:inline" style={{ color: '#8A9DB2' }}>
                  {locale === 'ar' ? 'متصل' : 'Online'}
                </span>
              </div>
              {/* Close button (floating variant only) */}
              {variant === 'floating' && (
                <button
                  onClick={() => setIsOpen(false)}
                  className="btn-close rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
                  style={{ width: 28, height: 28 }}
                  aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A9DB2" strokeWidth="2.5" strokeLinecap="round">
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
            className="flex-1 overflow-y-auto p-4 space-y-3 chat-messages"
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

          {/* ── V514: Quick Hint Chips — clickable suggestions under input ── */}
          {messages.length === 0 && !isLoading && (
            <div className="asst-quick-hints" dir={isRtl ? 'rtl' : 'ltr'}>
              {text.quickActions.slice(0, 4).map((qa, i) => (
                <button
                  key={i}
                  type="button"
                  className="asst-quick-hint"
                  onClick={() => {
                    setInput(qa.prompt);
                    inputRef.current?.focus();
                  }}
                >
                  <span style={{ marginLeft: isRtl ? 0 : 4, marginRight: isRtl ? 4 : 0 }}>{qa.icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
