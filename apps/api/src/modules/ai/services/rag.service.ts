import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * RAG Service — Retrieval-Augmented Generation
 *
 * Retrieves relevant context from the news/article archive
 * to enhance AI model responses with real-world information.
 *
 * Flow:
 * 1. User query → Embedding vector
 * 2. Vector similarity search against stored articles
 * 3. Top-k relevant articles → Formatted context
 * 4. Context injected into AI prompt
 *
 * Currently uses SQLite with in-memory cosine similarity.
 * When migrating to PostgreSQL + pgvector, replace with
 * prisma.$queryRaw`SELECT ... <=> $1` for native vector search.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.log('📚 RAG Service initialized — context retrieval ready');
  }

  /**
   * Retrieve relevant context for a query
   *
   * @param query The user's question or topic
   * @param limit Maximum number of articles to retrieve (default: 5)
   * @returns Formatted context string from relevant articles
   */
  async retrieveRelevantContext(query: string, limit: number = 5): Promise<string> {
    try {
      // Step 1: Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embed(query);

      // Step 2: Fetch candidate articles from database
      const articles = await this._fetchCandidateArticles(query, limit * 3);

      if (articles.length === 0) {
        this.logger.debug('📚 No articles found for context retrieval');
        return '';
      }

      // Step 3: Compute similarity scores
      const scored = articles
        .map((article) => {
          let similarity = 0;

          if (article.embedding) {
            try {
              const articleEmbedding = JSON.parse(article.embedding);
              similarity = this.embeddingService.cosineSimilarity(queryEmbedding, articleEmbedding);
            } catch {
              similarity = this._keywordSimilarity(query, `${article.title} ${article.content}`);
            }
          } else {
            // Fallback: keyword-based similarity
            similarity = this._keywordSimilarity(query, `${article.title} ${article.content}`);
          }

          return { article, similarity };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      // Step 4: Format context
      const context = scored
        .filter((s) => s.similarity > 0.1) // Minimum relevance threshold
        .map((s, i) => {
          const a = s.article;
          return `[${i + 1}] (${a.source}) ${a.title}\n${a.summary || a.content?.slice(0, 300) || ''}`;
        })
        .join('\n\n');

      if (context) {
        this.logger.debug(`📚 Retrieved ${scored.filter(s => s.similarity > 0.1).length} relevant articles for: "${query.slice(0, 50)}"`);
      }

      return context;
    } catch (error: any) {
      this.logger.error(`RAG retrieval failed: ${error.message}`);
      return ''; // Non-blocking: return empty context on failure
    }
  }

  /**
   * Store an article with its embedding for future retrieval
   */
  async storeArticle(data: {
    source: string;
    title: string;
    content: string;
    summary?: string;
    url?: string;
    sentiment?: number;
    entities?: string[];
    publishedAt: Date;
  }): Promise<void> {
    try {
      // Generate embedding for the article
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
    } catch (error: any) {
      this.logger.error(`Failed to store article: ${error.message}`);
    }
  }

  /**
   * Get statistics about the article archive
   */
  async getArchiveStats(): Promise<{ totalArticles: number; sources: string[]; latestArticle: Date | null }> {
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

  // ── Private: Article Retrieval ──

  /**
   * Fetch candidate articles from the database
   * Uses keyword pre-filtering to reduce search space
   */
  private async _fetchCandidateArticles(query: string, limit: number) {
    // Extract keywords from query for initial filtering
    const keywords = this._extractKeywords(query);

    // Fetch recent articles, prioritizing those with keyword matches
    // In SQLite, we do a broad fetch and score in memory
    // In PostgreSQL+pgvector, this would be a vector similarity query
    const articles = await this.prisma.newsArticle.findMany({
      where: {
        OR: [
          // Try to match keywords in title or content
          ...keywords.map((kw) => ({
            title: { contains: kw, mode: 'insensitive' as const },
          })),
          ...keywords.map((kw) => ({
            content: { contains: kw, mode: 'insensitive' as const },
          })),
        ],
      },
      take: limit,
      orderBy: { publishedAt: 'desc' },
    });

    // If keyword search returned too few, get recent articles
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

  /**
   * Extract keywords from a query string
   */
  private _extractKeywords(query: string): string[] {
    // Remove common stop words and extract meaningful terms
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

    // Return unique keywords, max 5
    return [...new Set(words)].slice(0, 5);
  }

  /**
   * Simple keyword-based similarity as fallback
   * Uses TF-IDF-like scoring
   */
  private _keywordSimilarity(query: string, text: string): number {
    const queryWords = new Set(this._extractKeywords(query));
    const textWords = new Set(
      text.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    );

    if (queryWords.size === 0 || textWords.size === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (textWords.has(word)) matches++;
    }

    return matches / queryWords.size;
  }
}
