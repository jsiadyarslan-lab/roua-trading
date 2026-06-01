"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RagService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagService = void 0;
const common_1 = require("@nestjs/common");
const embedding_service_1 = require("./embedding.service");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
let RagService = RagService_1 = class RagService {
    constructor(embeddingService, prisma, redis) {
        this.embeddingService = embeddingService;
        this.prisma = prisma;
        this.redis = redis;
        this.logger = new common_1.Logger(RagService_1.name);
        this.RAG_CACHE_TTL_MS = 10 * 60 * 1000;
        this.logger.log('📚 RAG Service initialized — context retrieval ready' + (this.redis ? ' (with Redis cache)' : ''));
    }
    async retrieveRelevantContext(query, limit = 5) {
        const queryHash = this._hashQuery(query);
        const cacheKey = `rag:${queryHash}`;
        try {
            const cached = await this.redis?.get(cacheKey);
            if (cached) {
                this.logger.debug(`📚 Redis cache hit for RAG query: "${query.slice(0, 50)}"`);
                return cached;
            }
        }
        catch { }
        const result = await this._retrieveWithoutCache(query, limit);
        if (result) {
            try {
                await this.redis?.set(cacheKey, result, this.RAG_CACHE_TTL_MS);
            }
            catch { }
        }
        return result;
    }
    async _retrieveWithoutCache(query, limit) {
        try {
            const queryEmbedding = await this.embeddingService.embed(query);
            const articles = await this._fetchCandidateArticles(query, limit * 3);
            if (articles.length === 0) {
                this.logger.debug('📚 No articles found for context retrieval');
                return '';
            }
            const scored = articles
                .map((article) => {
                let similarity = 0;
                if (article.embedding) {
                    try {
                        const articleEmbedding = JSON.parse(article.embedding);
                        similarity = this.embeddingService.cosineSimilarity(queryEmbedding, articleEmbedding);
                    }
                    catch {
                        similarity = this._keywordSimilarity(query, `${article.title} ${article.content}`);
                    }
                }
                else {
                    similarity = this._keywordSimilarity(query, `${article.title} ${article.content}`);
                }
                return { article, similarity };
            })
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit);
            const context = scored
                .filter((s) => s.similarity > 0.1)
                .map((s, i) => {
                const a = s.article;
                return `[${i + 1}] (${a.source}) ${a.title}\n${a.summary || a.content?.slice(0, 300) || ''}`;
            })
                .join('\n\n');
            if (context) {
                this.logger.debug(`📚 Retrieved ${scored.filter(s => s.similarity > 0.1).length} relevant articles for: "${query.slice(0, 50)}"`);
            }
            return context;
        }
        catch (error) {
            this.logger.error(`RAG retrieval failed: ${error.message}`);
            return '';
        }
    }
    _hashQuery(query) {
        let hash = 0;
        const str = query.toLowerCase().trim();
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }
    async storeArticle(data) {
        try {
            const textToEmbed = `${data.title} ${data.summary || data.content.slice(0, 500)}`;
            const embedding = await this.embeddingService.embed(textToEmbed);
            await this.prisma.newsArticle.create({
                data: {
                    source: data.source,
                    title: data.title,
                    content: data.content,
                    summary: data.summary,
                    url: data.url,
                    sentiment: data.sentiment,
                    entities: data.entities ? JSON.stringify(data.entities) : null,
                    embedding: JSON.stringify(embedding),
                    publishedAt: data.publishedAt,
                },
            });
            this.logger.debug(`📚 Stored article: "${data.title.slice(0, 50)}"`);
        }
        catch (error) {
            this.logger.error(`Failed to store article: ${error.message}`);
        }
    }
    async getArchiveStats() {
        const totalArticles = await this.prisma.newsArticle.count();
        const sources = await this.prisma.newsArticle.findMany({
            select: { source: true },
            distinct: ['source'],
        });
        const latest = await this.prisma.newsArticle.findFirst({
            orderBy: { publishedAt: 'desc' },
            select: { publishedAt: true },
        });
        return {
            totalArticles,
            sources: sources.map((s) => s.source),
            latestArticle: latest?.publishedAt || null,
        };
    }
    async _fetchCandidateArticles(query, limit) {
        const keywords = this._extractKeywords(query);
        const articles = await this.prisma.newsArticle.findMany({
            where: {
                OR: [
                    ...keywords.map((kw) => ({
                        title: { contains: kw, mode: 'insensitive' },
                    })),
                    ...keywords.map((kw) => ({
                        content: { contains: kw, mode: 'insensitive' },
                    })),
                ],
            },
            take: limit,
            orderBy: { publishedAt: 'desc' },
        });
        if (articles.length < 5) {
            const recentArticles = await this.prisma.newsArticle.findMany({
                orderBy: { publishedAt: 'desc' },
                take: limit - articles.length,
                where: {
                    id: { notIn: articles.map((a) => a.id) },
                },
            });
            articles.push(...recentArticles);
        }
        return articles;
    }
    _extractKeywords(query) {
        const stopWords = new Set([
            'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هل', 'ما', 'هو', 'هي',
            'أن', 'التي', 'الذي', 'هذا', 'هذه', 'ذلك', 'تلك',
            'the', 'is', 'are', 'was', 'were', 'a', 'an', 'and', 'or', 'but',
            'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
            'ما', 'هل', 'كيف', 'لماذا', 'متى', 'أين', 'لمن',
        ]);
        const words = query
            .toLowerCase()
            .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2 && !stopWords.has(w));
        return [...new Set(words)].slice(0, 5);
    }
    _keywordSimilarity(query, text) {
        const queryWords = new Set(this._extractKeywords(query));
        const textWords = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
        if (queryWords.size === 0 || textWords.size === 0)
            return 0;
        let matches = 0;
        for (const word of queryWords) {
            if (textWords.has(word))
                matches++;
        }
        return matches / queryWords.size;
    }
};
exports.RagService = RagService;
exports.RagService = RagService = RagService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [embedding_service_1.EmbeddingService,
        prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], RagService);
//# sourceMappingURL=rag.service.js.map