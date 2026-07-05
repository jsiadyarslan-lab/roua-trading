// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Council Vote Accuracy Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "حلقة التعلم" — يتتبع من كان على حق ومن كان على خطأ
// ويُعدّل أوزان أعضاء المجلس بناءً على أدائهم
//
// V185: النظام يتعلم من أخطائه — بالضبط كما يفعل المتداول الذكي
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

/** Role definitions matching the council */
const COUNCIL_ROLES = [
  { id: 'tech', name: 'المحلل الفني', baseWeight: 1.0 },
  { id: 'sent', name: 'محلل المشاعر', baseWeight: 1.0 },
  { id: 'risk', name: 'خبير المخاطر', baseWeight: 1.2 },  // Risk expert gets slightly higher base
  { id: 'macro', name: 'خبير الماكرو', baseWeight: 1.0 },
  { id: 'pattern', name: 'خبير الأنماط', baseWeight: 1.0 },
  { id: 'exec', name: 'استراتيجي التنفيذ', baseWeight: 1.0 },
  { id: 'diverge', name: 'محلل التباين', baseWeight: 1.1 }, // Divergence gets slightly higher base
  { id: 'scenario', name: 'محلل السيناريوهات', baseWeight: 1.0 },
  { id: 'prediction-market', name: 'محلل الأسواق التنبؤية', baseWeight: 1.5 },
  { id: 'scanner', name: 'السكانر الفني المتقدم', baseWeight: 1.2 },
] as const;

const ACCURACY_WINDOW = 20; // Rolling window size for accuracy calculation
const MIN_VOTES_FOR_WEIGHT = 5; // Need at least 5 votes before adjusting weight
const MAX_WEIGHT = 2.5;
const MIN_WEIGHT = 0.3;

@Injectable()
export class CouncilVoteAccuracyService {
  private readonly logger = new Logger(CouncilVoteAccuracyService.name);
  private readonly REDIS_WEIGHT_CACHE = 'council-accuracy:weights:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('🎯 Council Vote Accuracy Service initialized — من كان على حق؟');
    // Start periodic accuracy calculation
    this._startPeriodicCalculation();
  }

  /**
   * Get the current weight for a role (used by consensus calculation)
   * This is the main method called by StrategicCouncilService
   */
  async getRoleWeight(userId: string, roleId: string): Promise<number> {
    try {
      // Check Redis cache first
      const cached = await this.redis.get(`${this.REDIS_WEIGHT_CACHE}${userId}:${roleId}`);
      if (cached) return Number(cached);

      // Fall back to database
      const record = await this.prisma.councilVoteAccuracy.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });

      if (record) {
        const weight = Number(record.currentWeight);
        await this.redis.set(`${this.REDIS_WEIGHT_CACHE}${userId}:${roleId}`, String(weight), 300 * 1000);
        return weight;
      }

      // Default: return base weight for this role
      const roleDef = COUNCIL_ROLES.find(r => r.id === roleId);
      return roleDef?.baseWeight ?? 1.0;
    } catch {
      return 1.0; // Safe fallback
    }
  }

  /**
   * Get all role weights for a user (for injecting into council session)
   */
  async getAllRoleWeights(userId: string): Promise<Record<string, number>> {
    const weights: Record<string, number> = {};
    for (const role of COUNCIL_ROLES) {
      weights[role.id] = await this.getRoleWeight(userId, role.id);
    }
    return weights;
  }

  /**
   * Record a vote result for a role (called after trade close)
   */
  async recordVoteResult(
    userId: string,
    roleId: string,
    wasCorrect: boolean,
    symbol?: string,
    regime?: string,
  ): Promise<void> {
    try {
      const roleDef = COUNCIL_ROLES.find(r => r.id === roleId);
      if (!roleDef) return;

      // Upsert the accuracy record
      const existing = await this.prisma.councilVoteAccuracy.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });

      if (existing) {
        // Update existing record
        const last10: number[] = JSON.parse(existing.last10Votes || '[]');
        last10.push(wasCorrect ? 1 : 0);
        if (last10.length > ACCURACY_WINDOW) last10.shift();

        const totalVotes = existing.totalVotes + 1;
        const correctVotes = existing.correctVotes + (wasCorrect ? 1 : 0);

        // Calculate streak
        let streakCurrent = existing.streakCurrent;
        if (wasCorrect) {
          streakCurrent = streakCurrent > 0 ? streakCurrent + 1 : 1;
        } else {
          streakCurrent = streakCurrent < 0 ? streakCurrent - 1 : -1;
        }
        const streakBest = Math.max(existing.streakBest, wasCorrect ? streakCurrent : 0);

        // Update symbol accuracy
        const symbolAcc: Record<string, { total: number; correct: number }> = JSON.parse(existing.symbolAccuracy || '{}');
        if (symbol) {
          if (!symbolAcc[symbol]) symbolAcc[symbol] = { total: 0, correct: 0 };
          symbolAcc[symbol].total++;
          if (wasCorrect) symbolAcc[symbol].correct++;
        }

        // Update regime accuracy
        const regimeField = regime === 'BULL' ? 'bullAccuracy' : regime === 'BEAR' ? 'bearAccuracy' : regime === 'RANGE' ? 'rangeAccuracy' : null;

        await this.prisma.councilVoteAccuracy.update({
          where: { id: existing.id },
          data: {
            totalVotes,
            correctVotes,
            last10Votes: JSON.stringify(last10),
            streakCurrent,
            streakBest,
            symbolAccuracy: JSON.stringify(symbolAcc),
            lastVotedAt: new Date(),
            ...(regimeField && wasCorrect ? { [regimeField]: { increment: 1 } } : {}),
          },
        });
      } else {
        // Create new record
        await this.prisma.councilVoteAccuracy.create({
          data: {
            userId,
            roleId,
            roleName: roleDef.name,
            totalVotes: 1,
            correctVotes: wasCorrect ? 1 : 0,
            last10Votes: JSON.stringify([wasCorrect ? 1 : 0]),
            streakCurrent: wasCorrect ? 1 : -1,
            streakBest: wasCorrect ? 1 : 0,
            baseWeight: roleDef.baseWeight,
            currentWeight: roleDef.baseWeight,
            symbolAccuracy: symbol ? JSON.stringify({ [symbol]: { total: 1, correct: wasCorrect ? 1 : 0 } }) : '{}',
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to record vote result: ${error.message}`);
    }
  }

  /**
   * Recalculate weights for all roles of a user
   * Called periodically and after each trade close
   */
  async recalculateWeights(userId: string): Promise<Record<string, number>> {
    const weights: Record<string, number> = {};

    for (const role of COUNCIL_ROLES) {
      try {
        const record = await this.prisma.councilVoteAccuracy.findUnique({
          where: { userId_roleId: { userId, roleId: role.id } },
        });

        if (!record || record.totalVotes < MIN_VOTES_FOR_WEIGHT) {
          weights[role.id] = role.baseWeight;
          continue;
        }

        // Calculate accuracy from last N votes
        const last10: number[] = JSON.parse(record.last10Votes || '[]');
        const recentAccuracy = last10.length > 0
          ? last10.reduce((a, b) => a + b, 0) / last10.length
          : 0;

        const overallAccuracy = record.correctVotes / record.totalVotes;

        // Weight formula: blend of recent accuracy (70%) and overall accuracy (30%)
        const blendedAccuracy = (recentAccuracy * 0.7) + (overallAccuracy * 0.3);

        // Calculate new weight based on accuracy
        let newWeight: number;
        let reason: string;

        if (blendedAccuracy >= 0.75) {
          newWeight = Math.min(role.baseWeight * 1.8, MAX_WEIGHT);
          reason = `أداء ممتاز (${(blendedAccuracy * 100).toFixed(0)}%)`;
        } else if (blendedAccuracy >= 0.60) {
          newWeight = Math.min(role.baseWeight * 1.3, MAX_WEIGHT);
          reason = `أداء جيد (${(blendedAccuracy * 100).toFixed(0)}%)`;
        } else if (blendedAccuracy >= 0.45) {
          newWeight = role.baseWeight;
          reason = `أداء متوسط (${(blendedAccuracy * 100).toFixed(0)}%)`;
        } else if (blendedAccuracy >= 0.30) {
          newWeight = Math.max(role.baseWeight * 0.6, MIN_WEIGHT);
          reason = `أداء ضعيف (${(blendedAccuracy * 100).toFixed(0)}%)`;
        } else {
          newWeight = Math.max(role.baseWeight * 0.3, MIN_WEIGHT);
          reason = `أداء سيء جداً (${(blendedAccuracy * 100).toFixed(0)}%)`;
        }

        // Streak bonus/penalty
        if (record.streakCurrent >= 5) {
          newWeight = Math.min(newWeight * 1.15, MAX_WEIGHT);
          reason += ` + سلسلة صحيحة ${record.streakCurrent}`;
        } else if (record.streakCurrent <= -3) {
          newWeight = Math.max(newWeight * 0.85, MIN_WEIGHT);
          reason += ` - سلسلة خاطئة ${Math.abs(record.streakCurrent)}`;
        }

        // Smooth transition (don't change weight too drastically)
        const currentWeight = Number(record.currentWeight);
        newWeight = currentWeight + (newWeight - currentWeight) * 0.3; // 30% adjustment per calculation
        newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newWeight));

        // Update database
        await this.prisma.councilVoteAccuracy.update({
          where: { id: record.id },
          data: {
            currentWeight: newWeight,
            weightReason: reason,
            lastCalculatedAt: new Date(),
          },
        });

        // Update cache
        await this.redis.set(
          `${this.REDIS_WEIGHT_CACHE}${userId}:${role.id}`,
          String(newWeight),
          300 * 1000,
        );

        weights[role.id] = newWeight;
      } catch (error) {
        weights[role.id] = role.baseWeight;
      }
    }

    this.logger.log(`🎯 Weights recalculated for user ${userId}: ${JSON.stringify(weights)}`);
    return weights;
  }

  /**
   * Process pending accuracy updates from Redis queue
   * Called by the periodic calculation
   */
  async processPendingUpdates(): Promise<number> {
    let processed = 0;
    try {
      // Find all pending update keys
      const keys: string[] = []; // Redis keys scan not available — use alternative pattern
      try {
        // Use a Redis set to track pending update keys instead of keys()
        const pendingData = await this.redis.get('council-accuracy:pending-keys');
        if (pendingData) {
          const parsed = JSON.parse(pendingData);
          for (const key of parsed) {
            const data = await this.redis.get(key);
            if (data) keys.push(key);
          }
        }
      } catch { /* continue */ }
      // BUG-033 FIX: Clean up the pending-keys list after processing
      const remainingKeys: string[] = [];
      for (const key of keys) {
        try {
          const data = await this.redis.get(key);
          if (!data) {
            // Key already expired or processed — don't add to remaining
            continue;
          }

          const { userId, wasRight, regimeAtEntry, symbol } = JSON.parse(data);

          // Record vote result for each role
          for (const [roleId, correct] of Object.entries(wasRight)) {
            await this.recordVoteResult(userId, roleId, correct as boolean, symbol, regimeAtEntry);
          }

          // Recalculate weights after all updates
          await this.recalculateWeights(userId);

          // Clean up the queue item
          await this.redis.del(key);
          processed++;
          // Don't add to remainingKeys — it's been processed
        } catch {
          // Skip malformed entries — also don't add to remaining
        }
      }
      // Update the pending-keys list with only unprocessed entries (empty if all processed)
      if (keys.length > 0) {
        await this.redis.set('council-accuracy:pending-keys', JSON.stringify(remainingKeys), 3600 * 1000);
      }
    } catch (error) {
      this.logger.error(`Failed to process pending updates: ${error.message}`);
    }
    return processed;
  }

  /**
   * Get accuracy report for a user
   */
  async getAccuracyReport(userId: string): Promise<any[]> {
    const records = await this.prisma.councilVoteAccuracy.findMany({
      where: { userId },
      orderBy: { currentWeight: 'desc' },
    });

    return records.map(r => ({
      roleId: r.roleId,
      roleName: r.roleName,
      totalVotes: r.totalVotes,
      correctVotes: r.correctVotes,
      accuracy: r.totalVotes > 0 ? Math.round((r.correctVotes / r.totalVotes) * 100) : 0,
      currentWeight: Number(r.currentWeight),
      baseWeight: Number(r.baseWeight),
      weightChange: Number(r.currentWeight) - Number(r.baseWeight),
      streakCurrent: r.streakCurrent,
      last10: JSON.parse(r.last10Votes || '[]'),
      weightReason: r.weightReason,
    }));
  }

  // ── Private Methods ──

  private _accuracyCalculationInterval: NodeJS.Timeout | null = null; // V220: cleanup on destroy

  private _startPeriodicCalculation(): void {
    // Process pending updates every 5 minutes
    // V220-FIX: Store interval reference for cleanup on module destroy
    this._accuracyCalculationInterval = setInterval(async () => {
      try {
        const count = await this.processPendingUpdates();
        if (count > 0) {
          this.logger.log(`🎯 Processed ${count} pending accuracy updates`);
        }
      } catch {
        // Non-critical
      }
    }, 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    // V220-FIX: Clean up interval to prevent memory leak on shutdown/hot-reload
    if (this._accuracyCalculationInterval) {
      clearInterval(this._accuracyCalculationInterval);
      this._accuracyCalculationInterval = null;
    }
  }
}
