// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — System Memory Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "ذاكرة النظام" — النظام لا يبدأ من الصفر كل يوم
// يتذكر أنماطاً تعلمها وأخطاء ارتكبها ودروساً استخلصها
//
// V185: المتداول الذكي لا يحلل من الصفر — يتذكر
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

export type MemoryType =
  | 'INSIGHT'          // Market observation ("BTC يتفاعل مع 67K")
  | 'PATTERN'          // Recurring pattern ("الثلاثاء دائماً هبوطي")
  | 'FAILED_SETUP'     // Failed trade setup ("BUY عند RSI<30 فشل 4/5")
  | 'REGIME_HISTORY'   // Regime changes ("أسبوع في وضع عرضي")
  | 'DAILY_SUMMARY'    // End of day summary
  | 'WEEKLY_PATTERN'   // Weekly recurring patterns
  | 'LESSON';          // Learned lesson from a trade

export interface MemoryEntry {
  type: MemoryType;
  symbol?: string;
  content: string;
  confidence?: number;
  validUntil?: Date;
  sourceTradeId?: string;
}

@Injectable()
export class SystemMemoryService {
  private readonly logger = new Logger(SystemMemoryService.name);
  private readonly REDIS_MEMORY_PREFIX = 'system-memory:context:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🧠 System Memory initialized — النظام يتذكر');
    this._startPeriodicCleanup();
  }

  /**
   * Store a new memory
   */
  async storeMemory(userId: string | null, entry: MemoryEntry): Promise<string | null> {
    try {
      const memory = await this.prisma.systemMemory.create({
        data: {
          userId,
          type: entry.type,
          symbol: entry.symbol,
          content: entry.content,
          confidence: entry.confidence ?? 50,
          validUntil: entry.validUntil,
          sourceTradeId: entry.sourceTradeId,
          isActive: true,
        },
      });

      // Invalidate cache
      const cacheKey = `${this.REDIS_MEMORY_PREFIX}${userId || 'global'}`;
      try { await this.redis.del(cacheKey); } catch { /* non-critical */ }

      this.logger.log(`🧠 Memory stored: [${entry.type}] ${entry.content.substring(0, 50)}...`);
      return memory.id;
    } catch (error) {
      this.logger.error(`Failed to store memory: ${error.message}`);
      return null;
    }
  }

  /**
   * Auto-generate memories from a closed trade
   * Called by TradeJournalService after trade close
   */
  async generateMemoriesFromTrade(
    userId: string,
    trade: {
      symbol: string;
      side: string;
      result: 'WIN' | 'LOSS' | 'BREAKEVEN';
      pnlPercent: number;
      regimeAtEntry?: string;
      councilVotes?: Record<string, string>;
      durationMs?: number;
    },
  ): Promise<void> {
    const memories: MemoryEntry[] = [];

    // ── Lesson Memory ──
    if (trade.result === 'LOSS' && Math.abs(trade.pnlPercent) > 3) {
      memories.push({
        type: 'LESSON',
        symbol: trade.symbol,
        content: `خسارة كبيرة ${trade.side} ${trade.symbol}: ${trade.pnlPercent.toFixed(2)}% — تجنب الدخول بنفس الظروف`,
        confidence: 80,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });
    }

    // ── Failed Setup Memory ──
    if (trade.result === 'LOSS' && trade.councilVotes) {
      // Check if a specific pattern of votes led to a loss
      const votes = Object.entries(trade.councilVotes);
      const majorityDirection = trade.side;
      const agreeingRoles = votes.filter(([, v]) => v === majorityDirection).map(([k]) => k);

      if (agreeingRoles.length >= 6) {
        // Even with strong agreement, we lost — remember this
        memories.push({
          type: 'FAILED_SETUP',
          symbol: trade.symbol,
          content: `إجماع قوي (${agreeingRoles.join('+')}) على ${majorityDirection} ${trade.symbol} لكن الصفقة خسرت — الإجماع ليس ضماناً`,
          confidence: 70,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        });
      }
    }

    // ── Regime-Aware Pattern ──
    if (trade.regimeAtEntry) {
      const key = `${trade.regimeAtEntry}_${trade.side}_${trade.result}`;
      memories.push({
        type: 'PATTERN',
        symbol: trade.symbol,
        content: `${trade.side} في وضع ${trade.regimeAtEntry} → ${trade.result === 'WIN' ? 'نجاح' : 'خسارة'} (${trade.pnlPercent.toFixed(1)}%)`,
        confidence: trade.result === 'WIN' ? 60 : 75, // Losses teach more
        validUntil: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days
      });
    }

    // ── Duration Pattern ──
    if (trade.durationMs) {
      const hours = trade.durationMs / (60 * 60 * 1000);
      if (trade.result === 'WIN' && hours < 1) {
        memories.push({
          type: 'PATTERN',
          symbol: trade.symbol,
          content: `صفقة ${trade.side} ${trade.symbol} سريعة (${hours.toFixed(1)}س) كانت ناجحة — الأرباح السريعة ممكنة`,
          confidence: 55,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
      } else if (trade.result === 'LOSS' && hours > 24) {
        memories.push({
          type: 'PATTERN',
          symbol: trade.symbol,
          content: `صفقة ${trade.side} ${trade.symbol} طويلة (${hours.toFixed(1)}س) خسرت — التأخير في الخروج يزيد الخسارة`,
          confidence: 65,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        });
      }
    }

    // Store all generated memories
    for (const memory of memories) {
      await this.storeMemory(userId, memory);
    }
  }

  /**
   * Get relevant memories for a council session
   * Returns formatted context string for AI prompts
   */
  async getMemoryContext(userId: string | null, symbol?: string): Promise<string> {
    const cacheKey = `${this.REDIS_MEMORY_PREFIX}${userId || 'global'}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    } catch { /* continue */ }

    // Fetch active, relevant memories
    const memories = await this.prisma.systemMemory.findMany({
      where: {
        userId,
        isActive: true,
        ...(symbol ? { symbol } : {}),
        OR: [
          { validUntil: null },
          { validUntil: { gte: new Date() } },
        ],
      },
      orderBy: [
        { confidence: 'desc' },
        { relevanceScore: 'desc' },
      ],
      take: 15, // Top 15 most relevant
    });

    if (memories.length === 0) return '';

    const typeEmoji: Record<string, string> = {
      INSIGHT: '💡',
      PATTERN: '🔄',
      FAILED_SETUP: '❌',
      REGIME_HISTORY: '📊',
      DAILY_SUMMARY: '📝',
      WEEKLY_PATTERN: '📅',
      LESSON: '🎓',
    };

    const contextLines = memories.map(m => {
      const emoji = typeEmoji[m.type] || '📌';
      const sym = m.symbol ? `[${m.symbol}]` : '[عام]';
      const conf = m.confidence ? `(${m.confidence}%)` : '';
      return `${emoji} ${sym} ${m.content} ${conf}`;
    });

    const context =
      `🧠🧠🧠 ذاكرة النظام (تعلّم من التجربة):\n` +
      contextLines.join('\n') +
      `\n⚠️ هذه ملاحظات من صفقات سابقة — خذها بعين الاعتبار!`;

    // Cache for 10 minutes
    try {
      await this.redis.set(cacheKey, context, 600 * 1000);
    } catch { /* non-critical */ }

    return context;
  }

  /**
   * Auto-generate daily summary memories
   */
  async generateDailySummary(userId: string): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayTrades = await this.prisma.tradeJournal.findMany({
        where: {
          userId,
          closedAt: { gte: today },
          result: { not: null },
        },
      });

      if (todayTrades.length === 0) return;

      const wins = todayTrades.filter(t => t.result === 'WIN').length;
      const losses = todayTrades.filter(t => t.result === 'LOSS').length;
      const winRate = Math.round((wins / todayTrades.length) * 100);
      const avgPnl = todayTrades.reduce((sum, t) => sum + Number(t.pnlPercent || 0), 0) / todayTrades.length;

      await this.storeMemory(userId, {
        type: 'DAILY_SUMMARY',
        content: `خلاصة اليوم: ${todayTrades.length} صفقة، ${wins} ربح / ${losses} خسارة (${winRate}% فوز)، متوسط ${avgPnl.toFixed(2)}%`,
        confidence: 90,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Remember for 7 days
      });
    } catch (error) {
      this.logger.error(`Failed to generate daily summary: ${error.message}`);
    }
  }

  /**
   * Increment usage counter when a memory is referenced
   */
  async markMemoryUsed(memoryId: string, wasCorrect: boolean): Promise<void> {
    try {
      await this.prisma.systemMemory.update({
        where: { id: memoryId },
        data: {
          timesUsed: { increment: 1 },
          timesCorrect: { increment: wasCorrect ? 1 : 0 },
          relevanceScore: wasCorrect
            ? { increment: 0.5 }
            : { decrement: 0.2 },
        },
      });
    } catch { /* non-critical */ }
  }

  // ── Private Methods ──

  private _startPeriodicCleanup(): void {
    // Deactivate expired memories every hour
    setInterval(async () => {
      try {
        const result = await this.prisma.systemMemory.updateMany({
          where: {
            validUntil: { lt: new Date() },
            isActive: true,
          },
          data: { isActive: false },
        });
        if (result.count > 0) {
          this.logger.log(`🧠 Deactivated ${result.count} expired memories`);
        }
      } catch { /* non-critical */ }
    }, 60 * 60 * 1000);
  }
}
