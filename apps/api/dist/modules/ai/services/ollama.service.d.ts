import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
export declare class OllamaService {
    private readonly configService;
    private readonly logger;
    private apiKey;
    private readonly baseUrl;
    private readonly defaultModel;
    constructor(configService: ConfigService);
    private _resolveApiKey;
    analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;
    private _isOllamaReachable;
    private _resolveModel;
    private _isCloudWithLocalhost;
    listModels(): Promise<string[]>;
    private _buildSystemPrompt;
    private _stubResponse;
}
