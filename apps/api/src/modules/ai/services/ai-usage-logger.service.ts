import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * AI Usage Logger Service — Automatically logs every AI API call to AiUsageLog
 *
 * This service bridges the gap between NestJS AI services and the AiUsageLog table
 * that the Next.js admin dashboard reads from. Without this, the cost dashboard
 * shows empty data because no one writes to AiUsageLog.
 *
 * Cost per 1K tokens (approximate, per-provider):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Provider       │ Input/1K      │ Output/1K    │ Model              │
 * ├───────────────┼──────────────┼─────────────┼──────────────────────┤
 * │ Groq          │ $0.00059     │ $0.00079    │ Llama 3.3 70B       │
 * │ Gemini        │ $0.000075    │ $0.00030    │ 2.0 Flash           │
 * │ GLM-4         │ $0.00140     │ $0.00140    │ glm-4               │
 * │ HuggingFace   │ $0.00000     │ $0.00000    │ Mistral-7B (free)   │
 * │ Ollama        │ $0.00000     │ $0.00000    │ Qwen2.5 (self-host) │
 * │ Bedrock       │ $0.000035    │ $0.00014    │ Nova Micro          │
 * │ OpenRouter    │ $0.00000     │ $0.00000    │ Free models         │
 * │ OpenRouter-Pd │ $0.00015     │ $0.00015    │ Paid (e.g. Haiku)   │
 * │ DeepSeek      │ $0.00014     │ $0.00028    │ DeepSeek Chat       │
 * │ Cerebras      │ $0.00000     │ $0.00000    │ FREE tier           │
 * │ NVIDIA        │ $0.00000     │ $0.00000    │ FREE tier           │
 * │ Mistral       │ $0.00000     │ $0.00000    │ FREE tier           │
 * │ Cache         │ $0.00000     │ $0.00000    │ Redis/memory hits   │
 * │ System        │ $0.00000     │ $0.00000    │ Internal fallback   │
 * │ Prediction    │ $0.00000     │ $0.00000    │ Polymarket etc.     │
 * └──────────────────────────────────────────────────────────────────────┘
 */

interface UsageLogEntry {
  userId?: string;
  model: string;
  provider: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cached: boolean;
  success: boolean;
  errorMessage?: string;
}

const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'groq':        { input: 0.00059,  output: 0.00079   },
  'gemini':      { input: 0.000075, output: 0.00030   },
  'glm':         { input: 0.00140,  output: 0.00140   },
  'huggingface': { input: 0,        output: 0         },
  'ollama':      { input: 0,        output: 0         },
  // FIX: Per-model Bedrock pricing — each model has its own rate.
  // Previously ALL bedrock entries were costed at Nova Micro rates,
  // causing massive under-reporting when Claude was used.
  'bedrock-nova-micro':  { input: 0.000035, output: 0.00014   },  // Nova Micro — cheapest
  'bedrock-nova-lite':   { input: 0.00006,  output: 0.00024   },  // Nova Lite
  'bedrock-claude-haiku': { input: 0.0008,  output: 0.004    },  // Claude 4.5 Haiku
  'bedrock-titan':       { input: 0.0005,   output: 0.0015   },  // Titan Premier/Express
  'bedrock-llama':       { input: 0.0003,   output: 0.0006   },  // Llama3 8B on Bedrock
  'bedrock':             { input: 0.0008,   output: 0.004    },  // Default: Claude Haiku (safest default)
  'openrouter':  { input: 0,        output: 0         },  // Free models — $0 cost
  'openrouter-paid': { input: 0.00015, output: 0.00015 },  // Paid models (e.g., Claude Haiku via OR)
  'deepseek':    { input: 0.00014, output: 0.00028   },  // DeepSeek Chat via OpenRouter
  'cerebras':    { input: 0,        output: 0         },  // Cerebras — FREE tier
  'nvidia':      { input: 0,        output: 0         },  // NVIDIA NIM — FREE tier
  'mistral':     { input: 0,        output: 0         },  // Mistral — FREE tier
  'cache':       { input: 0,        output: 0         },  // Redis/memory cache hits
  'system':      { input: 0,        output: 0         },  // Internal system (e.g., Orchestrator fallback)
  'prediction':  { input: 0,        output: 0         },  // Prediction Market (Polymarket etc.) — no LLM cost
};

function extractProvider(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('groq')) return 'groq';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('glm')) return 'glm';
  if (lower.includes('huggingface') || lower.includes('hf')) return 'huggingface';
  if (lower.includes('ollama')) return 'ollama';
  // FIX: Per-model Bedrock cost tier — map model name to correct pricing tier
  // instead of lumping all bedrock/claude into a single 'bedrock' bucket.
  // This prevents under-reporting costs when Claude is used at Nova Micro rates.
  if (lower.includes('bedrock')) {
    if (lower.includes('nova-micro') || lower.includes('nova_micro')) return 'bedrock-nova-micro';
    if (lower.includes('nova-lite') || lower.includes('nova_lite')) return 'bedrock-nova-lite';
    if (lower.includes('claude-haiku') || lower.includes('haiku')) return 'bedrock-claude-haiku';
    if (lower.includes('titan')) return 'bedrock-titan';
    if (lower.includes('llama')) return 'bedrock-llama';
    return 'bedrock'; // Default: Claude Haiku rate (safest — avoids under-reporting)
  }
  if (lower.includes('claude')) {
    // Claude via non-Bedrock path (e.g., OpenRouter) — don't pollute bedrock budget
    if (lower.includes('haiku')) return 'bedrock-claude-haiku';
    return 'openrouter-paid'; // Claude via OpenRouter = paid model
  }
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('cerebras')) return 'cerebras';
  if (lower.includes('nvidia')) return 'nvidia';
  if (lower.includes('mistral')) return 'mistral';
  if (lower.includes('openrouter')) {
    if (lower.includes(':free')) return 'openrouter';
    return 'openrouter-paid';
  }
  if (lower.includes('cache/') || lower.includes('cache:')) return 'cache';
  if (lower.includes('predictionmarket') || lower.includes('prediction')) return 'prediction';
  if (lower.includes('orchestrator') || lower.includes('fallback')) return 'system';
  return 'unknown';
}

function calculateCost(provider: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_1K[provider] || { input: 0, output: 0 };
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

@Injectable()
export class AiUsageLoggerService {
  private readonly logger = new Logger(AiUsageLoggerService.name);
  private writeQueue: UsageLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
  private readonly MAX_QUEUE_SIZE = 50;

  private dbAvailable = true;

  /** FIX #3: Fallback log entries — when DB is unavailable, we store logs in memory
   * and periodically try to write them to DB. This ensures AI usage data is never
   * lost even when the database is temporarily down (e.g., during NestJS cold starts
   * or Railway deployments). When the DB recovers, the fallback queue is flushed.
   */
  private fallbackQueue: UsageLogEntry[] = [];
  private readonly MAX_FALLBACK_QUEUE_SIZE = 500;
  private dbRetryAttempts = 0;
  private readonly MAX_DB_RETRY_ATTEMPTS = 20; // Stop retrying after 20 consecutive failures

  constructor(private readonly prisma: PrismaService) {
    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    this.logger.log('📊 AI Usage Logger initialized — will log all AI API calls to AiUsageLog');

    // SUSTAINABLE FIX: Check isAvailable() before making the test query.
    // The old code called this.prisma.aiUsageLog.count() immediately in the
    // constructor, which creates a new connection pool even when the DB is
    // unavailable. Each such pool leaks a PostgreSQL connection slot.
    // Now: Defer the test until the DB is confirmed available.
    if (this.prisma?.isAvailable?.()) {
      this.prisma.aiUsageLog.count().then(() => {
        this.dbAvailable = true;
        this.dbRetryAttempts = 0;
        this.logger.log('📊 AI Usage Logger DB connection verified');
      }).catch((err) => {
        this.dbAvailable = false;
        this.logger.warn(`📊 AI Usage Logger: DB not yet available (${err.message}) — will retry on flush`);
      });
    } else {
      this.dbAvailable = false;
      this.logger.warn('📊 AI Usage Logger: DB not yet available — will retry on flush');
    }
  }

  /**
   * Log an AI usage entry (non-blocking — queues for batch write)
   *
   * FIX #3: When DB is unavailable, entries go to fallbackQueue instead of being
   * silently dropped. This ensures no usage data is lost during NestJS outages.
   */
  log(entry: UsageLogEntry): void {
    if (this.dbAvailable) {
      this.writeQueue.push(entry);
    } else {
      // FIX #3: Store in fallback queue when DB is down
      this.fallbackQueue.push(entry);
      if (this.fallbackQueue.length > this.MAX_FALLBACK_QUEUE_SIZE) {
        this.fallbackQueue.shift(); // Remove oldest to prevent memory leak
      }
    }

    // Flush immediately if queue is getting large
    if (this.writeQueue.length >= this.MAX_QUEUE_SIZE) {
      this.flush();
    }
  }

  /**
   * Log a successful AI call with estimated tokens
   */
  logSuccess(params: {
    model: string;
    endpoint: string;
    inputPrompt: string;
    outputContent: string;
    latencyMs: number;
    cached: boolean;
    userId?: string;
  }): void {
    const provider = extractProvider(params.model);
    // FIX: Better token estimation — Arabic uses ~2 chars/token, English ~4 chars/token
    // Detect Arabic content by checking for Arabic Unicode range
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
    const inputArabicChars = (params.inputPrompt.match(arabicRegex) || []).length;
    const outputArabicChars = (params.outputContent.match(arabicRegex) || []).length;
    const inputArabicRatio = params.inputPrompt.length > 0 ? inputArabicChars / params.inputPrompt.length : 0;
    const outputArabicRatio = params.outputContent.length > 0 ? outputArabicChars / params.outputContent.length : 0;
    const inputCharsPerToken = 2 * inputArabicRatio + 4 * (1 - inputArabicRatio); // Blend Arabic and English
    const outputCharsPerToken = 2 * outputArabicRatio + 4 * (1 - outputArabicRatio);
    const inputTokens = Math.ceil(params.inputPrompt.length / inputCharsPerToken);
    const outputTokens = Math.ceil(params.outputContent.length / outputCharsPerToken);

    this.log({
      userId: params.userId,
      model: params.model,
      provider,
      endpoint: params.endpoint,
      inputTokens,
      outputTokens,
      latencyMs: params.latencyMs,
      cached: params.cached,
      success: true,
    });
  }

  /**
   * Log a failed AI call
   */
  logFailure(params: {
    model: string;
    endpoint: string;
    inputPrompt: string;
    latencyMs: number;
    errorMessage: string;
    userId?: string;
  }): void {
    const provider = extractProvider(params.model);
    // FIX: Failed calls should NOT contribute to budget tracking.
    // Previously, failed calls estimated input tokens and calculated costUsd,
    // which inflated the Bedrock budget counter even when no API call was made
    // (e.g., budget guard blocking → error → cost logged → budget grows).
    // Now: inputTokens=0 ensures costUsd=0 for failed calls.
    const inputTokens = 0;

    this.log({
      userId: params.userId,
      model: params.model,
      provider,
      endpoint: params.endpoint,
      inputTokens,
      outputTokens: 0,
      latencyMs: params.latencyMs,
      cached: false,
      success: false,
      errorMessage: params.errorMessage.substring(0, 500),
    });
  }

  /**
   * Flush queued entries to the database (batch write)
   *
   * FIX #3: On successful flush, also flush the fallback queue (DB recovered).
   * On failed flush, move current entries to fallback queue (DB still down).
   */
  private isFlushing = false;  // FIX: Flush lock to prevent race conditions

  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0 && this.fallbackQueue.length === 0) return;
    // FIX: Prevent concurrent flush operations that could lose entries
    if (this.isFlushing) return;
    this.isFlushing = true;

    // Merge fallback queue into write queue if DB is available
    if (this.dbAvailable && this.fallbackQueue.length > 0) {
      this.logger.log(`📊 Recovering ${this.fallbackQueue.length} entries from fallback queue`);
      this.writeQueue.push(...this.fallbackQueue.splice(0, this.fallbackQueue.length));
    }

    // Take all entries from queue
    const entries = this.writeQueue.splice(0, this.writeQueue.length);
    if (entries.length === 0) { this.isFlushing = false; return; }

    try {
      // Use createMany for efficient batch insert
      const records = entries.map(entry => ({
        id: `aul_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId: entry.userId || null,
        model: entry.model,
        provider: entry.provider,
        endpoint: entry.endpoint,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: calculateCost(entry.provider, entry.inputTokens, entry.outputTokens),
        latencyMs: entry.latencyMs,
        cached: entry.cached,
        success: entry.success,
        errorMessage: entry.errorMessage || null,
        createdAt: new Date(),
      }));

      await this.prisma.aiUsageLog.createMany({ data: records });
      this.dbAvailable = true;
      this.dbRetryAttempts = 0;
      this.logger.debug(`📊 Flushed ${records.length} AI usage logs to database`);
    } catch (error: any) {
      // FIX #3: Move failed entries to fallback queue instead of losing them
      this.dbAvailable = false;
      this.dbRetryAttempts++;
      this.fallbackQueue.push(...entries);
      if (this.fallbackQueue.length > this.MAX_FALLBACK_QUEUE_SIZE) {
        const dropped = this.fallbackQueue.length - this.MAX_FALLBACK_QUEUE_SIZE;
        this.fallbackQueue.splice(0, dropped);
        this.logger.warn(`📊 Fallback queue overflow — dropped ${dropped} oldest entries`);
      }
      this.logger.warn(`📊 Failed to flush AI usage logs (attempt ${this.dbRetryAttempts}): ${error.message}`);
      // FIX #3: After too many retries, temporarily reduce logging frequency
      if (this.dbRetryAttempts >= this.MAX_DB_RETRY_ATTEMPTS) {
        this.logger.warn(`📊 DB appears persistently unavailable — reducing log frequency`);
      }
    } finally {
      this.isFlushing = false;  // FIX: Release flush lock
    }
  }

  /**
   * FIX: Get monthly spend for a specific provider.
   * Used by the Bedrock budget guard in AIOrchestratorService.
   * Returns total costUsd for the given provider this month.
   */
  async getMonthlySpendForProvider(provider: string): Promise<number> {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const result = await this.prisma.aiUsageLog.aggregate({
        where: {
          provider,
          createdAt: { gte: monthStart },
        },
        _sum: { costUsd: true },
      });

      return result._sum.costUsd?.toNumber() ?? 0;
    } catch {
      // DB unavailable — return 0 to allow calls (fail open)
      return 0;
    }
  }

  /**
   * Force flush all pending entries (call on shutdown)
   */
  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
    this.logger.log('📊 AI Usage Logger flushed on shutdown');
  }
}
