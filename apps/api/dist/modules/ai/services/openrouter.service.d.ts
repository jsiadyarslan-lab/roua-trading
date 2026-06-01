import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
export declare class OpenRouterService {
    private readonly configService;
    private readonly logger;
    private apiKey;
    private readonly baseUrl;
    private readonly modelsUrl;
    private readonly staticModelCandidates;
    private discoveredFreeModels;
    private lastDiscoveryTime;
    private readonly discoveryCacheMs;
    private resolvedModel;
    constructor(configService: ConfigService);
    private _resolveApiKey;
    private _discoverFreeModels;
    analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;
    private _buildSystemPrompt;
    private _stubResponse;
}
