'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types matching backend ──
export enum ContentAgentStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PUBLISHING = 'PUBLISHING',
  CURATING = 'CURATING',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}

export enum ContentStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  SCHEDULED = 'SCHEDULED',
  ARCHIVED = 'ARCHIVED',
  REJECTED = 'REJECTED',
}

export enum ContentType {
  ARTICLE = 'ARTICLE',
  ANALYSIS = 'ANALYSIS',
  NEWS_DIGEST = 'NEWS_DIGEST',
  MARKET_REPORT = 'MARKET_REPORT',
  EDUCATIONAL = 'EDUCATIONAL',
  OPINION = 'OPINION',
  BREAKING = 'BREAKING',
}

export enum ContentCategory {
  CRYPTO = 'CRYPTO',
  FOREX = 'FOREX',
  STOCKS = 'STOCKS',
  COMMODITIES = 'COMMODITIES',
  ECONOMY = 'ECONOMY',
  REGULATION = 'REGULATION',
  TECHNOLOGY = 'TECHNOLOGY',
  EDUCATION = 'EDUCATION',
  GEOPOLITICS = 'GEOPOLITICS',
  DEFI = 'DEFI',
  NFT = 'NFT',
}

export enum ContentLanguage {
  AR = 'AR',
  EN = 'EN',
  BILINGUAL = 'BILINGUAL',
}

export enum ContentPriority {
  URGENT = 'URGENT',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW',
}

export interface ContentAgentState {
  status: ContentAgentStatus
  totalGenerated: number
  totalPublished: number
  lastGenerationAt?: string
  lastPublishAt?: string
  dailyQuota: number
  dailyGenerated: number
  dailyQuotaResetAt?: string
  activeTemplates: number
  pendingSchedule: number
  errors: number
  lastError?: string
}

export interface ContentArticle {
  id: string
  type: ContentType
  category: ContentCategory
  status: ContentStatus
  titleAr: string
  titleEn: string
  contentAr?: string
  contentEn?: string
  summaryAr?: string
  summaryEn?: string
  tags: string[]
  relatedSymbols: string[]
  qualityScore: number
  sentimentScore: number
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW'
  readingTimeMinutes: number
  views: number
  likes: number
  shares: number
  generationSource: string
  createdAt: string
  publishedAt?: string
  scheduledAt?: string
}

export interface ContentStats {
  totalArticles: number
  publishedArticles: number
  draftArticles: number
  scheduledArticles: number
  avgQualityScore: number
  totalViews: number
  totalShares: number
  articlesByCategory: Record<string, number>
  articlesByType: Record<string, number>
  recentPublishRate: number
  topPerformingCategory: string
}

export interface TrendingTopic {
  topic: string
  topicAr: string
  category: ContentCategory
  relevance: number
  articleCount: number
  sentiment: number
  relatedSymbols: string[]
}

export interface ContentGap {
  category: ContentCategory
  categoryAr: string
  lastArticleAt?: string
  gapHours: number
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  suggestedTopics: string[]
}

export interface ContentLog {
  time: string
  msg: string
  type: 'info' | 'success' | 'warning' | 'error' | 'content'
}

// ── Store ──
interface ContentAgentStore {
  // State
  agentState: ContentAgentState | null
  stats: ContentStats | null
  articles: ContentArticle[]
  trendingTopics: TrendingTopic[]
  contentGaps: ContentGap[]
  logs: ContentLog[]
  loading: boolean
  error: string | null
  feedFilters: {
    category?: ContentCategory
    type?: ContentType
    status?: ContentStatus
    page: number
    limit: number
  }

  // Actions
  setAgentState: (state: ContentAgentState | null) => void
  setStats: (stats: ContentStats | null) => void
  setArticles: (articles: ContentArticle[]) => void
  setTrendingTopics: (topics: TrendingTopic[]) => void
  setContentGaps: (gaps: ContentGap[]) => void
  addLog: (msg: string, type?: ContentLog['type']) => void
  clearLogs: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setFeedFilters: (filters: Partial<ContentAgentStore['feedFilters']>) => void

  // API Actions
  fetchState: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchFeed: () => Promise<void>
  fetchTrending: () => Promise<void>
  fetchGaps: () => Promise<void>
  generateContent: (params: {
    type: ContentType
    category: ContentCategory
    topic: string
    symbols?: string[]
    language?: ContentLanguage
    priority?: ContentPriority
  }) => Promise<void>
  generateBreaking: (topic: string, symbols: string[], context: string) => Promise<void>
  publishContent: (id: string) => Promise<void>
  archiveContent: (id: string) => Promise<void>

  // Auto-refresh
  startAutoRefresh: () => void
  stopAutoRefresh: () => void
}

let _refreshInterval: ReturnType<typeof setInterval> | null = null

export const useContentAgentStore = create<ContentAgentStore>()(
  persist(
    (set, get) => ({
      agentState: null,
      stats: null,
      articles: [],
      trendingTopics: [],
      contentGaps: [],
      logs: [],
      loading: false,
      error: null,
      feedFilters: {
        page: 1,
        limit: 20,
      },

      setAgentState: (agentState) => set({ agentState }),
      setStats: (stats) => set({ stats }),
      setArticles: (articles) => set({ articles }),
      setTrendingTopics: (trendingTopics) => set({ trendingTopics }),
      setContentGaps: (contentGaps) => set({ contentGaps }),
      addLog: (msg, type = 'info') => set((state) => ({
        logs: [{ time: new Date().toLocaleTimeString('ar-EG'), msg, type }, ...state.logs].slice(0, 100),
      })),
      clearLogs: () => set({ logs: [] }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setFeedFilters: (filters) => set((state) => ({
        feedFilters: { ...state.feedFilters, ...filters },
      })),

      // ── API Actions ──
      fetchState: async () => {
        try {
          const res = await fetch('/api/agent/content/state')
          const data = await res.json()
          if (data.success && data.data) {
            set({ agentState: data.data, error: null })
          } else {
            set({ agentState: null })
          }
        } catch {
          set({ agentState: null })
        }
      },

      fetchStats: async () => {
        try {
          const res = await fetch('/api/agent/content/stats')
          const data = await res.json()
          if (data.success && data.data) {
            set({ stats: data.data })
          }
        } catch {
          // Silent fail for stats
        }
      },

      fetchFeed: async () => {
        try {
          const { feedFilters } = get()
          const params = new URLSearchParams()
          if (feedFilters.category) params.set('category', feedFilters.category)
          if (feedFilters.type) params.set('type', feedFilters.type)
          if (feedFilters.status) params.set('status', feedFilters.status)
          params.set('page', String(feedFilters.page))
          params.set('limit', String(feedFilters.limit))

          const res = await fetch(`/api/agent/content/feed?${params.toString()}`)
          if (!res.ok) {
            // Don't spam errors — just return empty
            set({ articles: [] })
            return
          }
          const data = await res.json()
          if (data.success && data.data) {
            set({ articles: data.data.items || data.data || [] })
          } else {
            set({ articles: [] })
          }
        } catch {
          set({ articles: [] })
        }
      },

      fetchTrending: async () => {
        try {
          const res = await fetch('/api/agent/content/trending')
          const data = await res.json()
          if (data.success && data.data) {
            set({ trendingTopics: data.data })
          }
        } catch {
          // Silent fail
        }
      },

      fetchGaps: async () => {
        try {
          const res = await fetch('/api/agent/content/gaps')
          const data = await res.json()
          if (data.success && data.data) {
            set({ contentGaps: data.data })
          }
        } catch {
          // Silent fail
        }
      },

      generateContent: async (params) => {
        set({ loading: true, error: null })
        const categoryLabels: Record<string, string> = {
          CRYPTO: 'الكريبتو', FOREX: 'الفوركس', STOCKS: 'الأسهم',
          COMMODITIES: 'السلع', ECONOMY: 'الاقتصاد', TECHNOLOGY: 'التقنية',
        }
        get().addLog(`جارٍ توليد محتوى: ${params.topic} (${categoryLabels[params.category] || params.category})...`, 'info')
        try {
          const res = await fetch('/api/agent/content/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          })
          const data = await res.json()
          if (data.success) {
            set({ loading: false })
            get().addLog(`تم توليد المحتوى بنجاح — الجودة: ${data.data?.qualityScore || '—'}%`, 'success')
            // Refresh feed and stats
            get().fetchFeed()
            get().fetchStats()
            get().fetchState()
          } else {
            set({ error: data.message || 'فشل التوليد', loading: false })
            get().addLog(`فشل التوليد: ${data.message || 'خطأ غير معروف'}`, 'error')
          }
        } catch (e: any) {
          set({ error: e.message, loading: false })
          get().addLog(`خطأ في الاتصال: ${e.message}`, 'error')
        }
      },

      generateBreaking: async (topic, symbols, context) => {
        set({ loading: true, error: null })
        get().addLog(`تنبيه عاجل: ${topic}...`, 'warning')
        try {
          const res = await fetch('/api/agent/content/breaking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, symbols, context }),
          })
          const data = await res.json()
          if (data.success) {
            set({ loading: false })
            get().addLog('تم نشر التنبيه العاجل', 'success')
            get().fetchFeed()
            get().fetchStats()
          } else {
            set({ error: data.message || 'فشل التنبيه', loading: false })
            get().addLog(`فشل التنبيه: ${data.message}`, 'error')
          }
        } catch (e: any) {
          set({ error: e.message, loading: false })
          get().addLog(`خطأ: ${e.message}`, 'error')
        }
      },

      publishContent: async (id) => {
        get().addLog(`جارٍ نشر المحتوى...`, 'info')
        try {
          const res = await fetch(`/api/agent/content/${id}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          const data = await res.json()
          if (data.success) {
            get().addLog('تم نشر المحتوى بنجاح', 'success')
            get().fetchFeed()
            get().fetchStats()
            get().fetchState()
          } else {
            get().addLog(`فشل النشر: ${data.message}`, 'error')
          }
        } catch (e: any) {
          get().addLog(`خطأ: ${e.message}`, 'error')
        }
      },

      archiveContent: async (id) => {
        get().addLog(`جارٍ أرشفة المحتوى...`, 'info')
        try {
          const res = await fetch(`/api/agent/content/${id}`, {
            method: 'DELETE',
          })
          const data = await res.json()
          if (data.success) {
            get().addLog('تم أرشفة المحتوى', 'success')
            get().fetchFeed()
            get().fetchStats()
          } else {
            get().addLog(`فشل الأرشفة: ${data.message}`, 'error')
          }
        } catch (e: any) {
          get().addLog(`خطأ: ${e.message}`, 'error')
        }
      },

      // ── Auto-refresh (every 30s) ──
      startAutoRefresh: () => {
        if (_refreshInterval) return
        _refreshInterval = setInterval(() => {
          get().fetchState()
          get().fetchStats()
          get().fetchFeed()
        }, 30000)
      },

      stopAutoRefresh: () => {
        if (_refreshInterval) {
          clearInterval(_refreshInterval)
          _refreshInterval = null
        }
      },
    }),
    {
      name: 'roua-content-agent-storage',
      version: 1,
      migrate: (persistedState: any) => ({
        ...persistedState,
        agentState: null,
        stats: null,
        articles: [],
        trendingTopics: [],
        contentGaps: [],
        logs: [],
        loading: false,
        error: null,
        feedFilters: { page: 1, limit: 20 },
      }),
      partialize: (state) => ({
        feedFilters: state.feedFilters,
      }),
    }
  )
)
