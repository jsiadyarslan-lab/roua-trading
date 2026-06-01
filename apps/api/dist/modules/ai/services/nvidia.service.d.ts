import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
export declare class NvidiaService {
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
