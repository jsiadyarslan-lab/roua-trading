import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Embedding Service — Text-to-Vector Conversion
 *
 * Converts text into vector embeddings for semantic search.
 * Uses HuggingFace Inference API with all-MiniLM-L6-v2 model.
 *
 * Model: sentence-transformers/all-MiniLM-L6-v2
 * - 384-dimensional vectors
 * - Fast and lightweight
 * - Excellent for semantic similarity search
 * - Supports 50+ languages including Arabic
 *
 * Fallback: Simple hash-based embedding when API is unavailable
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string;
  private readonly model = 'sentence-transformers/all-MiniLM-L6-v2';
  private readonly hfBaseUrl = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
  private readonly DIMENSIONS = 384;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY', '')?.trim() || this.configService.get<string>('HF_API_KEY', '')?.trim() || '';
    if (this.apiKey) {
      this.logger.log('📐 Embedding Service initialized (all-MiniLM-L6-v2 via HuggingFace)');
    } else {
      this.logger.warn('⚠️ HUGGINGFACE_API_KEY not set — using hash-based fallback embeddings');
    }
  }

  /**
   * Generate embedding vector for a text string
   * Returns a normalized 384-dimensional vector
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return this._zeroVector();
    }

    // Truncate very long texts to avoid API limits
    const truncated = text.slice(0, 2000);

    if (this.apiKey) {
      try {
        return await this._embedViaHuggingFace(truncated);
      } catch (error: any) {
        this.logger.warn(`HuggingFace embedding failed: ${error.message} — using fallback`);
      }
    }

    // Fallback: hash-based embedding for development
    return this._hashBasedEmbed(truncated);
  }

  /**
   * Generate embeddings for multiple texts in a batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(texts.map((text) => this.embed(text)));
    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  // ── Private: HuggingFace API ──

  private async _embedViaHuggingFace(text: string): Promise<number[]> {
    const response = await axios.post(
      this.hfBaseUrl,
      { inputs: text, model: this.model },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );

    // HuggingFace returns shape [1, sequence_length, 384]
    // We take the mean across sequence_length to get a single 384-d vector
    const embeddings = response.data;

    if (Array.isArray(embeddings) && embeddings.length > 0) {
      const tokenEmbeddings = embeddings[0]; // [sequence_length, 384]

      if (Array.isArray(tokenEmbeddings) && Array.isArray(tokenEmbeddings[0])) {
        // Mean pooling across tokens
        return this._meanPool(tokenEmbeddings);
      } else if (Array.isArray(tokenEmbeddings) && typeof tokenEmbeddings[0] === 'number') {
        // Already a 1D vector
        return this._normalize(tokenEmbeddings);
      }
    }

    this.logger.warn('Unexpected HuggingFace response format — using fallback');
    return this._hashBasedEmbed(text);
  }

  /**
   * Mean pooling across token embeddings
   */
  private _meanPool(tokenEmbeddings: number[][]): number[] {
    const seqLen = tokenEmbeddings.length;
    const dim = tokenEmbeddings[0].length;
    const pooled = new Array(dim).fill(0);

    for (const token of tokenEmbeddings) {
      for (let i = 0; i < dim; i++) {
        pooled[i] += token[i] / seqLen;
      }
    }

    return this._normalize(pooled);
  }

  /**
   * Normalize vector to unit length
   */
  private _normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }

  /**
   * Hash-based fallback embedding for development
   * Creates a deterministic pseudo-embedding from text
   */
  private _hashBasedEmbed(text: string): number[] {
    const vector = new Array(this.DIMENSIONS).fill(0);

    // Simple but effective: use character codes to fill vector
    const lowerText = text.toLowerCase();
    for (let i = 0; i < lowerText.length; i++) {
      const charCode = lowerText.charCodeAt(i);
      const pos = i % this.DIMENSIONS;
      vector[pos] += Math.sin(charCode * (i + 1)) * Math.cos(charCode * 0.5);
    }

    // Add some bigram patterns for better semantic matching
    for (let i = 0; i < lowerText.length - 1; i++) {
      const bigram = lowerText.charCodeAt(i) * 31 + lowerText.charCodeAt(i + 1);
      const pos = bigram % this.DIMENSIONS;
      vector[pos] += Math.sin(bigram * 0.1) * 0.5;
    }

    return this._normalize(vector);
  }

  private _zeroVector(): number[] {
    return new Array(this.DIMENSIONS).fill(0);
  }
}
