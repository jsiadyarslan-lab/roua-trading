import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
export declare class DeepSeekService {
    private readonly configService;
    private readonly logger;
    constructor(configService: ConfigService);
    private _resolveApiKey;
    analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;
}
