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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var EmbeddingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let EmbeddingService = EmbeddingService_1 = class EmbeddingService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(EmbeddingService_1.name);
        this.model = 'sentence-transformers/all-MiniLM-L6-v2';
        this.hfBaseUrl = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
        this.DIMENSIONS = 384;
        this.apiKey = this.configService.get('HUGGINGFACE_API_KEY', '')?.trim() || this.configService.get('HF_API_KEY', '')?.trim() || '';
        if (this.apiKey) {
            this.logger.log('📐 Embedding Service initialized (all-MiniLM-L6-v2 via HuggingFace)');
        }
        else {
            this.logger.warn('⚠️ HUGGINGFACE_API_KEY not set — using hash-based fallback embeddings');
        }
    }
    async embed(text) {
        if (!text || text.trim().length === 0) {
            return this._zeroVector();
        }
        const truncated = text.slice(0, 2000);
        if (this.apiKey) {
            try {
                return await this._embedViaHuggingFace(truncated);
            }
            catch (error) {
                this.logger.warn(`HuggingFace embedding failed: ${error.message} — using fallback`);
            }
        }
        return this._hashBasedEmbed(truncated);
    }
    async embedBatch(texts) {
        const results = await Promise.all(texts.map((text) => this.embed(text)));
        return results;
    }
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0)
            return 0;
        return dotProduct / denominator;
    }
    async _embedViaHuggingFace(text) {
        const response = await axios_1.default.post(this.hfBaseUrl, { inputs: text, model: this.model }, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        const embeddings = response.data;
        if (Array.isArray(embeddings) && embeddings.length > 0) {
            const tokenEmbeddings = embeddings[0];
            if (Array.isArray(tokenEmbeddings) && Array.isArray(tokenEmbeddings[0])) {
                return this._meanPool(tokenEmbeddings);
            }
            else if (Array.isArray(tokenEmbeddings) && typeof tokenEmbeddings[0] === 'number') {
                return this._normalize(tokenEmbeddings);
            }
        }
        this.logger.warn('Unexpected HuggingFace response format — using fallback');
        return this._hashBasedEmbed(text);
    }
    _meanPool(tokenEmbeddings) {
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
    _normalize(vec) {
        const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
        if (norm === 0)
            return vec;
        return vec.map((v) => v / norm);
    }
    _hashBasedEmbed(text) {
        const vector = new Array(this.DIMENSIONS).fill(0);
        const lowerText = text.toLowerCase();
        for (let i = 0; i < lowerText.length; i++) {
            const charCode = lowerText.charCodeAt(i);
            const pos = i % this.DIMENSIONS;
            vector[pos] += Math.sin(charCode * (i + 1)) * Math.cos(charCode * 0.5);
        }
        for (let i = 0; i < lowerText.length - 1; i++) {
            const bigram = lowerText.charCodeAt(i) * 31 + lowerText.charCodeAt(i + 1);
            const pos = bigram % this.DIMENSIONS;
            vector[pos] += Math.sin(bigram * 0.1) * 0.5;
        }
        return this._normalize(vector);
    }
    _zeroVector() {
        return new Array(this.DIMENSIONS).fill(0);
    }
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = EmbeddingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmbeddingService);
//# sourceMappingURL=embedding.service.js.map