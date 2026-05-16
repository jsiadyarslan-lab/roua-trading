# 🔌 Integration Guide — AI Cost Reduction Services

**Status:** ✅ Ready to Integrate  
**Files Created:** 4 services + 3 documentation files  
**Estimated Integration Time:** 4-6 hours  
**Testing Time:** 2-3 hours

---

## 📋 Checklist

### Phase 1: Module Setup (1 hour)

- [ ] **Update CommonModule**
  ```typescript
  // apps/api/src/common/common.module.ts
  
  import { Module } from '@nestjs/common';
  import { PrismaModule } from './prisma/prisma.module';
  import { RedisModule } from './redis/redis.module';
  import { AICacheService } from './cache/ai-cache.service';
  import { DuplicateCheckerService } from './dedup/duplicate-checker.service';
  
  @Module({
    imports: [
      PrismaModule,
      RedisModule,
    ],
    providers: [
      AICacheService,
      DuplicateCheckerService,
    ],
    exports: [
      AICacheService,
      DuplicateCheckerService,
    ],
  })
  export class CommonModule {}
  ```

- [ ] **Update AIModule**
  ```typescript
  // apps/api/src/modules/ai/ai.module.ts
  
  import { Module } from '@nestjs/common';
  import { CommonModule } from '../../common/common.module';
  import { AIOrchestratorService } from './services/ai-orchestrator.service';
  import { AICostOptimizerService } from './services/ai-cost-optimizer.service';
  import { GroqService } from './services/groq.service';
  import { GeminiService } from './services/gemini.service';
  import { GLMService } from './services/glm.service';
  
  @Module({
    imports: [CommonModule],
    providers: [
      AIOrchestratorService,
      AICostOptimizerService,
      GroqService,
      GeminiService,
      GLMService,
    ],
    exports: [
      AIOrchestratorService,
      AICostOptimizerService,
    ],
  })
  export class AIModule {}
  ```

- [ ] **Update NewsModule**
  ```typescript
  // apps/api/src/modules/news/news.module.ts
  
  import { Module } from '@nestjs/common';
  import { CommonModule } from '../../common/common.module';
  import { AIModule } from '../ai/ai.module';
  import { NewsService } from './news.service';
  import { NewsBatchService } from './news-batch.service';
  
  @Module({
    imports: [
      CommonModule,
      AIModule,
    ],
    providers: [
      NewsService,
      NewsBatchService,
    ],
    exports: [
      NewsService,
      NewsBatchService,
    ],
  })
  export class NewsModule {}
  ```

### Phase 2: Core Logic Updates (2 hours)

- [ ] **Update AIOrchestratorService**
  ```typescript
  // apps/api/src/modules/ai/services/ai-orchestrator.service.ts
  
  import { Injectable, Inject, Optional } from '@nestjs/common';
  import { AICacheService } from '../../../common/cache/ai-cache.service';
  import { AICostOptimizerService } from './ai-cost-optimizer.service';
  
  @Injectable()
  export class AIOrchestratorService {
    constructor(
      @Optional() private cache: AICacheService,
      private optimizer: AICostOptimizerService,
      private groq: GroqService,
      private gemini: GeminiService,
      private glm: GLMService,
    ) {}
  
    async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
      // 1️⃣ Check cache first
      if (this.cache) {
        const cached = await this.cache.getOrSet(
          request.type,
          () => this._executeAnalysis(request),
          request.prompt,
          { symbol: request.symbol },
          { ttl: 86400, enabled: true }
        );
        if (cached) {
          this.logger.debug(`✅ Cache HIT for ${request.type}`);
          return cached;
        }
      }
  
      // 2️⃣ Smart model selection
      const models = this.optimizer.getRecommendedModels(
        request.type,
        this._estimateComplexity(request)
      );
      this.logger.debug(`📊 Selected models: ${models.join(', ')}`);
  
      // 3️⃣ Try models in priority order
      for (const modelName of models) {
        try {
          const result = await this._callModel(modelName, request);
          return result;
        } catch (error) {
          this.logger.warn(`⚠️ Model ${modelName} failed: ${error.message}`);
          // Try next model
        }
      }
  
      throw new Error(`❌ All models failed for ${request.type}`);
    }
  
    private async _callModel(
      name: string,
      request: AnalysisRequest
    ): Promise<AnalysisResponse> {
      switch (name.toLowerCase()) {
        case 'groq':
          return this.groq.analyze(request);
        case 'gemini':
          return this.gemini.analyze(request);
        case 'glm':
          return this.glm.analyze(request);
        default:
          throw new Error(`Unknown model: ${name}`);
      }
    }
  
    private _estimateComplexity(request: AnalysisRequest): 'low' | 'medium' | 'high' {
      const type = request.type.toLowerCase();
      if (type.includes('prediction') || type.includes('strategy')) return 'high';
      if (type.includes('analysis') || type.includes('market')) return 'medium';
      return 'low';
    }
  
    private async _executeAnalysis(request: AnalysisRequest): Promise<AnalysisResponse> {
      const models = this.optimizer.getRecommendedModels(request.type);
      // ... original logic
    }
  }
  ```

- [ ] **Update NewsService**
  ```typescript
  // apps/api/src/modules/news/news.service.ts
  
  import { NewsBatchService } from './news-batch.service';
  
  @Injectable()
  export class NewsService implements OnModuleInit {
    constructor(
      private newsBatch: NewsBatchService,
      private prisma: PrismaService,
    ) {}
  
    async fetchAndAnalyzeNews() {
      this.logger.log('📰 Starting news fetch and analysis...');
      
      const rawNews = await this._fetchAllSources();
      
      if (rawNews.length === 0) {
        this.logger.warn('No news fetched from any source');
        return;
      }
  
      this.logger.log(`📰 Fetched ${rawNews.length} raw news items`);
      
      // Use optimized batch processing
      await this.newsBatch.processBatch(rawNews, {
        limit: 5,           // Top 5 articles
        concurrency: 3      // 3 concurrent AI calls
      });
    }
  }
  ```

### Phase 3: Database Setup (30 minutes)

- [ ] **Create Prisma Migration**
  ```bash
  # Create migration file
  npx prisma migrate create --name add_news_indexes
  ```

- [ ] **Add Indexes**
  ```prisma
  // prisma/migrations/[timestamp]_add_news_indexes/migration.sql
  
  -- Duplicate checking indexes
  CREATE INDEX idx_newsarticle_url ON "NewsArticle"(url);
  CREATE UNIQUE INDEX uidx_newsarticle_url ON "NewsArticle"(url) WHERE url IS NOT NULL;
  CREATE INDEX idx_newsarticle_title ON "NewsArticle"(title);
  CREATE INDEX idx_newsarticle_source_published ON "NewsArticle"(source, "publishedAt");
  ```

- [ ] **Apply Migration**
  ```bash
  npx prisma migrate deploy
  ```

### Phase 4: Testing (2 hours)

- [ ] **Unit Tests for AICacheService**
  ```typescript
  // apps/api/src/common/cache/ai-cache.service.spec.ts
  
  describe('AICacheService', () => {
    let service: AICacheService;
    let redis: RedisService;
  
    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          AICacheService,
          { provide: RedisService, useValue: mockRedis },
        ],
      }).compile();
      service = module.get(AICacheService);
      redis = module.get(RedisService);
    });
  
    it('should cache and retrieve values', async () => {
      const result = await service.getOrSet(
        'test',
        () => Promise.resolve({ data: 'test' }),
        'content',
        {},
        { ttl: 3600 }
      );
      expect(result).toEqual({ data: 'test' });
    });
  
    it('should return cached value on second call', async () => {
      const spy = jest.fn().mockResolvedValue({ data: 'test' });
      
      await service.getOrSet('test', spy, 'content', {}, { ttl: 3600 });
      await service.getOrSet('test', spy, 'content', {}, { ttl: 3600 });
      
      expect(spy).toHaveBeenCalledTimes(1); // Called once, second was cache hit
    });
  });
  ```

- [ ] **Unit Tests for DuplicateCheckerService**
  ```typescript
  describe('DuplicateCheckerService', () => {
    it('should detect URL duplicates', async () => {
      const result = await service.isNewsArticleDuplicate(
        'https://example.com',
        'Title'
      );
      // Assume article exists in DB
      expect(result.isDuplicate).toBe(true);
    });
  
    it('should return false for new articles', async () => {
      const result = await service.isNewsArticleDuplicate(
        'https://new.com',
        'New Title'
      );
      expect(result.isDuplicate).toBe(false);
    });
  });
  ```

- [ ] **Integration Test**
  ```typescript
  describe('AI Cost Reduction Integration', () => {
    it('should reduce tokens through caching', async () => {
      const stats1 = cache.getStats();
      
      // First call
      await orchestrator.analyze({ prompt: 'test', type: 'sentiment' });
      
      // Second call (same content)
      await orchestrator.analyze({ prompt: 'test', type: 'sentiment' });
      
      const stats2 = cache.getStats();
      expect(stats2.hits).toBeGreaterThan(stats1.hits);
    });
  
    it('should skip duplicates before AI calls', async () => {
      const aiSpy = jest.spyOn(groq, 'analyze');
      
      // Process duplicate article
      await newsBatch.processBatch([
        { url: 'https://example.com', title: 'News' }
      ]);
      
      // Article exists, so AI should not be called
      expect(aiSpy).not.toHaveBeenCalled();
    });
  });
  ```

### Phase 5: Monitoring (30 minutes)

- [ ] **Add Admin Endpoints**
  ```typescript
  // apps/api/src/modules/admin/admin.controller.ts
  
  @Controller('admin')
  export class AdminController {
    constructor(
      private cache: AICacheService,
      private dupChecker: DuplicateCheckerService,
      private optimizer: AICostOptimizerService,
    ) {}
  
    @Get('cache/stats')
    getCacheStats() {
      return this.cache.getStats();
    }
  
    @Get('dedup/stats')
    async getDuplicateStats(@Query('days') days = 7) {
      return this.dupChecker.getDuplicateStats(days);
    }
  
    @Get('costs/optimizer')
    getCostOptimization() {
      this.optimizer.logOptimizationReport();
      return this.optimizer.analyzeBatch([
        { type: 'sentiment', count: 240 },
        { type: 'market_analysis', count: 140 },
        { type: 'council', count: 96 },
      ]);
    }
  
    @Get('costs/breakdown')
    getCostBreakdown() {
      return {
        cached: this.cache.getStats(),
        duplicates: 'pending',
        optimization: 'pending',
      };
    }
  }
  ```

- [ ] **Add Metrics (if using Prometheus)**
  ```typescript
  import { Counter, Gauge, Histogram } from '@nestjs/metrics';
  
  @Injectable()
  export class MetricsService {
    @Gauge({
      name: 'ai_cache_hit_rate',
      help: 'AI cache hit rate percentage',
    })
    getCacheHitRate() {
      return parseFloat(this.cache.getStats().hitRate);
    }
  
    @Counter({
      name: 'ai_tokens_consumed_total',
      help: 'Total AI tokens consumed',
    })
    recordTokens(count: number) {
      // called by AIOrchestratorService
    }
  
    @Gauge({
      name: 'ai_daily_cost_usd',
      help: 'Estimated daily AI cost in USD',
    })
    getDailyCost() {
      const tokenStats = this.getTokensToday();
      return tokenStats.tokens * 0.00000117; // avg token cost
    }
  }
  ```

### Phase 6: Deployment (1 hour)

- [ ] **Build and Test**
  ```bash
  npm run build
  npm run test
  npm run test:e2e
  ```

- [ ] **Deploy to Staging**
  ```bash
  # Tag staging version
  git tag v0.2.0-cost-reduction
  git push origin v0.2.0-cost-reduction
  
  # Railway automatic deploy to staging
  # Monitor: https://dashboard.railway.app
  ```

- [ ] **Verify in Staging**
  ```bash
  # Check endpoints
  curl http://staging.local:3001/api/admin/cache/stats
  curl http://staging.local:3001/api/admin/dedup/stats
  
  # Run smoke tests
  npm run test:e2e
  ```

- [ ] **Deploy to Production**
  ```bash
  # Tag production version
  git tag v0.2.0
  git push origin v0.2.0
  
  # Railway automatic deploy
  # Enable canary deployment (10% traffic first)
  ```

---

## 📊 Monitoring & Validation

### Daily Monitoring Checklist

```bash
# 1. Check cache performance
curl http://api.prod:3001/api/admin/cache/stats
{
  "hits": 1234,
  "misses": 456,
  "sets": 200,
  "hitRate": "73.03",
  "estimatedTokenSavings": 617000
}

# 2. Check duplicate detection
curl http://api.prod:3001/api/admin/dedup/stats?days=7
{
  "totalArticles": 3420,
  "duplicateArticles": 1368,
  "duplicatePercentage": "39.94",
  "tokensSpared": 1094400
}

# 3. Check cost optimizer report
curl http://api.prod:3001/api/admin/costs/optimizer
{
  "estimatedDailyCost": 0.45,
  "estimatedMonthlyCost": 13.50,
  "potentialSavings": 85.50
}

# 4. Check logs for errors
kubectl logs -f deployment/roua-api -n production | grep -i "cache\|dedup\|optimizer"
```

### Expected Metrics (After 1 Week)

```
Cache Hit Rate:        ✅ 50-70% (warming up)
Duplicate Detection:   ✅ 35-40% of articles
Token Reduction:       ✅ 60-70% (ramp-up)
Model Cost Avg:        ✅ $0.00015 per call
Daily Cost:            ✅ $0.50-0.75 (stabilizing)
```

### Success Criteria (After 2 Weeks)

```
✅ Cache hit rate: >60%
✅ Duplicate rate: 35-40%
✅ Token reduction: >75%
✅ Cost: <$0.30/day
✅ No errors in logs
✅ P95 latency: <2s
✅ Request success rate: >99.5%
```

---

## 🚨 Rollback Plan

If issues occur:

```bash
# Option 1: Disable cache
export AI_CACHE_ENABLED=false

# Option 2: Disable dedup checking
export DEDUP_ENABLED=false

# Option 3: Full rollback
git revert v0.2.0
git push origin main
# Railway auto-redeploys
```

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue: Cache not hitting**
```
Diagnosis: Check Redis connection
Solution: 
1. Verify REDIS_URL in .env
2. Check Redis memory usage
3. Verify key naming (should be ai:namespace:hash)
```

**Issue: Duplicate checker slow**
```
Diagnosis: Missing indexes
Solution:
1. Run: npx prisma migrate deploy
2. Verify indexes: SELECT * FROM pg_indexes WHERE tablename = 'NewsArticle'
3. Rebuild indexes if needed
```

**Issue: AI cost not reducing**
```
Diagnosis: Services not injected properly
Solution:
1. Check module imports
2. Verify @Optional() decorator
3. Check logs for injection errors
```

---

## ✅ Final Checklist

Before going live:

- [ ] All 4 services are imported in modules
- [ ] Database indexes created and verified
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] Admin endpoints responding correctly
- [ ] Monitoring/metrics configured
- [ ] Staging deployment successful
- [ ] Team trained on new services
- [ ] Documentation reviewed
- [ ] Rollback plan tested
- [ ] Change log updated

---

**Ready to Deploy!** 🚀

Next steps: Run tests → Deploy to staging → Monitor for 48h → Deploy to production

Estimated total time to full benefit: **2-3 weeks**
