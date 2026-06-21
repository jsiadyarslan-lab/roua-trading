// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Agent Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Content Status ──

export enum ContentStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  SCHEDULED = 'SCHEDULED',
  ARCHIVED = 'ARCHIVED',
  REJECTED = 'REJECTED',
}

// ── Content Types ──

export enum ContentType {
  ARTICLE = 'ARTICLE',
  ANALYSIS = 'ANALYSIS',
  NEWS_DIGEST = 'NEWS_DIGEST',
  MARKET_REPORT = 'MARKET_REPORT',
  EDUCATIONAL = 'EDUCATIONAL',
  OPINION = 'OPINION',
  BREAKING = 'BREAKING',
  HOURLY_UPDATE = 'HOURLY_UPDATE',
  WEEKLY_REVIEW = 'WEEKLY_REVIEW',
  PAIR_ANALYSIS = 'PAIR_ANALYSIS',
}

// ── Content Categories ──

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

// ── Language ──

export enum ContentLanguage {
  AR = 'AR',
  EN = 'EN',
  BILINGUAL = 'BILINGUAL',
}

// ── Generation Source ──

export enum GenerationSource {
  AI_GENERATED = 'AI_GENERATED',
  AI_CURATED = 'AI_CURATED',
  HUMAN_WRITTEN = 'HUMAN_WRITTEN',
  AI_ASSISTED = 'AI_ASSISTED',
  RSS_FEED = 'RSS_FEED',
  API_FEED = 'API_FEED',
}

// ── Content Priority ──

export enum ContentPriority {
  URGENT = 'URGENT',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW',
}

// ── SEO Metadata ──

export interface SeoMetadata {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  canonicalUrl?: string;
  ogImage?: string;
  ogType: string;
  structuredData?: Record<string, any>; // JSON-LD
}

// ── Content Metrics ──

export interface ContentMetrics {
  views: number;
  uniqueViews: number;
  readTime: number; // Average read time in seconds
  shares: number;
  likes: number;
  comments: number;
  bounceRate: number; // 0-100
  avgScrollDepth: number; // 0-100
  ctr: number; // Click-through rate
}

// ── AI Generation Config ──

export interface AiGenerationConfig {
  model: string; // e.g., 'gpt-4', 'glm-5'
  temperature: number; // 0.0 - 1.0
  maxTokens: number;
  language: ContentLanguage;
  tone: 'professional' | 'casual' | 'educational' | 'urgent';
  targetAudience: 'beginner' | 'intermediate' | 'advanced' | 'all';
  wordCountRange: { min: number; max: number };
  includeChartAnalysis: boolean;
  includePriceTargets: boolean;
  includeRiskWarning: boolean;
}

// ── Content Generation Request ──

export interface ContentGenerationRequest {
  type: ContentType;
  category: ContentCategory;
  topic: string;
  symbols?: string[]; // Related trading symbols
  language: ContentLanguage;
  priority: ContentPriority;
  sourceData?: ContentSourceData;
  aiConfig?: Partial<AiGenerationConfig>;
  scheduledAt?: Date;
  tags?: string[];
  authorId?: string;
}

// ── Content Source Data ──

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
  keyLevels?: { support: number; resistance: number };
}

// ── Generated Content ──

export interface GeneratedContent {
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string;
  summaryAr: string;
  summaryEn: string;
  excerpt: string; // Short excerpt for cards/lists (bilingual)
  // V9: Multilingual fields — French, Turkish, Spanish
  titleFr?: string;
  contentFr?: string;
  summaryFr?: string;
  titleTr?: string;
  contentTr?: string;
  summaryTr?: string;
  titleEs?: string;
  contentEs?: string;
  summaryEs?: string;
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
  confidence: number; // 0-100 — AI confidence in content quality
  qualityScore: number; // 0-100 — content quality assessment
  sentimentScore: number; // -1.0 to 1.0
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  riskWarnings: string[];
  sources: string[]; // Attribution URLs
}

// ── Content Schedule ──

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

// ── Content Template ──

export interface ContentTemplate {
  id: string;
  name: string;
  nameAr: string;
  type: ContentType;
  category: ContentCategory;
  systemPrompt: string;
  userPromptTemplate: string; // Template with {variables}
  variables: string[]; // List of template variables
  defaultAiConfig: AiGenerationConfig;
  isActive: boolean;
}

// ── Agent State ──

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

export enum ContentAgentStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PUBLISHING = 'PUBLISHING',
  CURATING = 'CURATING',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}

// ── API DTOs ──

import {
  IsOptional, IsString, IsEnum, IsArray,
  IsBoolean, IsDateString, ValidateNested, IsInt, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateContentDto {
  @IsEnum(ContentType)
  type: ContentType;

  @IsEnum(ContentCategory)
  category: ContentCategory;

  @IsString()
  topic: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symbols?: string[];

  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @IsOptional()
  @IsEnum(ContentPriority)
  priority?: ContentPriority;

  @IsOptional()
  aiConfig?: Partial<AiGenerationConfig>;

  @IsOptional()
  @IsDateString()
  scheduledAt?: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateContentDto {
  @IsOptional()
  @IsString()
  titleAr?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @IsString()
  contentAr?: string;

  @IsOptional()
  @IsString()
  contentEn?: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: Date;
}

export class BulkGenerateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object) // ContentGenerationRequest is an interface, not a class
  requests: ContentGenerationRequest[];

  @IsOptional()
  @IsBoolean()
  publishImmediately?: boolean;
}

export class GetContentFeedDto {
  @IsOptional()
  @IsEnum(ContentCategory)
  category?: ContentCategory;

  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @IsOptional()
  @IsEnum(ContentLanguage)
  language?: ContentLanguage;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  symbol?: string;
}

export class ScheduleContentDto {
  @IsString()
  contentId: string;

  @IsDateString()
  scheduledAt: Date;

  @IsOptional()
  @IsString()
  platform?: 'WEBSITE' | 'TELEGRAM' | 'TWITTER' | 'ALL';
}
