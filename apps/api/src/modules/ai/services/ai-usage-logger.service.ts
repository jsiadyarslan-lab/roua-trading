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
 * │ Bedrock       │ $0.00300     │ $0.01500    │ Claude 3.5 Sonnet   │
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
  'groq':        { input: 0.00059,  output: 0.00079  },
  'gemini':      { input: 0.000075, output: 0.00030  },
  'glm':         { input: 0.00140,  output: 0.00140  },
  'huggingface': { input: 0,        output: 0        },
  'ollama':      { input: 0,        output: 0        },
  'bedrock':     { input: 0.00300,  output: 0.01500  },
  'openrouter':  { input: 0,        output: 0        },  // Free models — $0 cost
};

function extractProvider(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('groq')) return 'groq';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('glm')) return 'glm';
  if (lower.includes('huggingface') || lower.includes('hf')) return 'huggingface';
  if (lower.includes('ollama')) return 'ollama';
  if (lower.includes('bedrock') || lower.includes('claude')) return 'bedrock';
  if (lower.includes('openrouter') || lower.includes('deepseek')) return 'openrouter';
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

  constructor(private readonly prisma: PrismaService) {
    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    this.logger.log('📊 AI Usage Logger initialized — will log all AI API calls to AiUsageLog');
  }

  /**
   * Log an AI usage entry (non-blocking — queues for batch write)
   */
  log(entry: UsageLogEntry): void {
    this.writeQueue.push(entry);

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
    // Estimate tokens: ~4 chars per token for English, ~2 chars per token for Arabic
    const avgCharsPerToken = 3;
    const inputTokens = Math.ceil(params.inputPrompt.length / avgCharsPerToken);
    const outputTokens = Math.ceil(params.outputContent.length / avgCharsPerToken);

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
    const inputTokens = Math.ceil(params.inputPrompt.length / 3);

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
   */
  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0) return;

    // Take all entries from queue
    const entries = this.writeQueue.splice(0, this.writeQueue.length);
    if (entries.length === 0) return;

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
      this.logger.debug(`📊 Flushed ${records.length} AI usage logs to database`);
    } catch (error: any) {
      // Don't crash the app if logging fails — it's non-critical
      this.logger.warn(`Failed to flush AI usage logs: ${error.message}`);
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
