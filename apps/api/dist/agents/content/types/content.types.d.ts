export declare enum ContentStatus {
    DRAFT = "DRAFT",
    IN_REVIEW = "IN_REVIEW",
    APPROVED = "APPROVED",
    PUBLISHED = "PUBLISHED",
    SCHEDULED = "SCHEDULED",
    ARCHIVED = "ARCHIVED",
    REJECTED = "REJECTED"
}
export declare enum ContentType {
    ARTICLE = "ARTICLE",
    ANALYSIS = "ANALYSIS",
    NEWS_DIGEST = "NEWS_DIGEST",
    MARKET_REPORT = "MARKET_REPORT",
    EDUCATIONAL = "EDUCATIONAL",
    OPINION = "OPINION",
    BREAKING = "BREAKING",
    HOURLY_UPDATE = "HOURLY_UPDATE",
    WEEKLY_REVIEW = "WEEKLY_REVIEW",
    PAIR_ANALYSIS = "PAIR_ANALYSIS"
}
export declare enum ContentCategory {
    CRYPTO = "CRYPTO",
    FOREX = "FOREX",
    STOCKS = "STOCKS",
    COMMODITIES = "COMMODITIES",
    ECONOMY = "ECONOMY",
    REGULATION = "REGULATION",
    TECHNOLOGY = "TECHNOLOGY",
    EDUCATION = "EDUCATION",
    GEOPOLITICS = "GEOPOLITICS",
    DEFI = "DEFI",
    NFT = "NFT"
}
export declare enum ContentLanguage {
    AR = "AR",
    EN = "EN",
    BILINGUAL = "BILINGUAL"
}
export declare enum GenerationSource {
    AI_GENERATED = "AI_GENERATED",
    AI_CURATED = "AI_CURATED",
    HUMAN_WRITTEN = "HUMAN_WRITTEN",
    AI_ASSISTED = "AI_ASSISTED",
    RSS_FEED = "RSS_FEED",
    API_FEED = "API_FEED"
}
export declare enum ContentPriority {
    URGENT = "URGENT",
    HIGH = "HIGH",
    NORMAL = "NORMAL",
    LOW = "LOW"
}
export interface SeoMetadata {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
    canonicalUrl?: string;
    ogImage?: string;
    ogType: string;
    structuredData?: Record<string, any>;
}
export interface ContentMetrics {
    views: number;
    uniqueViews: number;
    readTime: number;
    shares: number;
    likes: number;
    comments: number;
    bounceRate: number;
    avgScrollDepth: number;
    ctr: number;
}
export interface AiGenerationConfig {
    model: string;
    temperature: number;
    maxTokens: number;
    language: ContentLanguage;
    tone: 'professional' | 'casual' | 'educational' | 'urgent';
    targetAudience: 'beginner' | 'intermediate' | 'advanced' | 'all';
    wordCountRange: {
        min: number;
        max: number;
    };
    includeChartAnalysis: boolean;
    includePriceTargets: boolean;
    includeRiskWarning: boolean;
}
export interface ContentGenerationRequest {
    type: ContentType;
    category: ContentCategory;
    topic: string;
    symbols?: string[];
    language: ContentLanguage;
    priority: ContentPriority;
    sourceData?: ContentSourceData;
    aiConfig?: Partial<AiGenerationConfig>;
    scheduledAt?: Date;
    tags?: string[];
    authorId?: string;
}
export interface ContentSourceData {
    newsArticles?: NewsSourceItem[];
    marketData?: MarketDataSource;
    referenceUrls?: string[];
    customContext?: string;
}
export interface NewsSourceItem {
    title: string;
    content: string;
    source: string;
    url?: string;
    publishedAt: Date;
    sentiment?: number;
}
export interface MarketDataSource {
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    keyLevels?: {
        support: number;
        resistance: number;
    };
}
export interface GeneratedContent {
    titleAr: string;
    titleEn: string;
    contentAr: string;
    contentEn: string;
    summaryAr: string;
    summaryEn: string;
    excerpt: string;
    category: ContentCategory;
    categoryAr: string;
    tags: string[];
    relatedSymbols: string[];
    seo: SeoMetadata;
    readingTimeMinutes: number;
    wordCountAr: number;
    wordCountEn: number;
    aiModel: string;
    generationSource: GenerationSource;
    confidence: number;
    qualityScore: number;
    sentimentScore: number;
    impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    riskWarnings: string[];
    sources: string[];
}
export interface ContentSchedule {
    id: string;
    contentId: string;
    scheduledAt: Date;
    publishedAt?: Date;
    status: 'PENDING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
    platform: 'WEBSITE' | 'TELEGRAM' | 'TWITTER' | 'ALL';
    retryCount: number;
    lastError?: string;
}
export interface ContentTemplate {
    id: string;
    name: string;
    nameAr: string;
    type: ContentType;
    category: ContentCategory;
    systemPrompt: string;
    userPromptTemplate: string;
    variables: string[];
    defaultAiConfig: AiGenerationConfig;
    isActive: boolean;
}
export interface ContentAgentState {
    status: ContentAgentStatus;
    totalGenerated: number;
    totalPublished: number;
    lastGenerationAt?: Date;
    lastPublishAt?: Date;
    dailyQuota: number;
    dailyGenerated: number;
    dailyQuotaResetAt?: Date;
    activeTemplates: number;
    pendingSchedule: number;
    errors: number;
    lastError?: string;
}
export declare enum ContentAgentStatus {
    IDLE = "IDLE",
    GENERATING = "GENERATING",
    PUBLISHING = "PUBLISHING",
    CURATING = "CURATING",
    PAUSED = "PAUSED",
    ERROR = "ERROR"
}
export declare class GenerateContentDto {
    type: ContentType;
    category: ContentCategory;
    topic: string;
    symbols?: string[];
    language?: ContentLanguage;
    priority?: ContentPriority;
    aiConfig?: Partial<AiGenerationConfig>;
    scheduledAt?: Date;
    tags?: string[];
}
export declare class UpdateContentDto {
    titleAr?: string;
    titleEn?: string;
    contentAr?: string;
    contentEn?: string;
    status?: ContentStatus;
    tags?: string[];
    scheduledAt?: Date;
}
export declare class BulkGenerateDto {
    requests: ContentGenerationRequest[];
    publishImmediately?: boolean;
}
export declare class GetContentFeedDto {
    category?: ContentCategory;
    type?: ContentType;
    language?: ContentLanguage;
    status?: ContentStatus;
    page?: number;
    limit?: number;
    symbol?: string;
}
export declare class ScheduleContentDto {
    contentId: string;
    scheduledAt: Date;
    platform?: 'WEBSITE' | 'TELEGRAM' | 'TWITTER' | 'ALL';
}
