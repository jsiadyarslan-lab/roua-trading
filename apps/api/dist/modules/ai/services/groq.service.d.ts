import { ConfigService } from '@nestjs/config';
export interface AIAnalysisRequest {
    symbol?: string;
    prompt: string;
    type: 'market_analysis' | 'sentiment' | 'prediction' | 'general' | 'signal_generation' | 'risk_analysis';
    language?: string;
}
export interface AIAnalysisResponse {
    model: string;
    content: string;
    confidence: number;
    processingTimeMs: number;
    language: string;
    isFallback?: boolean;
}
export declare class GroqService {
    private readonly configService;
    private readonly logger;
    private apiKey;
    private readonly baseUrl;
    private readonly modelCandidates;
    private resolvedModel;
    constructor(configService: ConfigService);
    private _resolveApiKey;
    analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;
    private _buildSystemPrompt;
    private _stubResponse;
}
