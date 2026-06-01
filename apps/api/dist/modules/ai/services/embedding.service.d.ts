import { ConfigService } from '@nestjs/config';
export declare class EmbeddingService {
    private readonly configService;
    private readonly logger;
    private readonly apiKey;
    private readonly model;
    private readonly hfBaseUrl;
    private readonly DIMENSIONS;
    constructor(configService: ConfigService);
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    cosineSimilarity(a: number[], b: number[]): number;
    private _embedViaHuggingFace;
    private _meanPool;
    private _normalize;
    private _hashBasedEmbed;
    private _zeroVector;
}
