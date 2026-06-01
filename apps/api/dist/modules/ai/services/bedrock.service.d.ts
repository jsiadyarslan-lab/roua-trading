import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
export declare class BedrockService {
    private readonly configService;
    private readonly logger;
    private accessKeyId;
    private secretAccessKey;
    private readonly region;
    private available;
    private client;
    private readonly modelCandidates;
    private resolvedModel;
    private lastError;
    constructor(configService: ConfigService);
    private _resolveKey;
    private _initClient;
    analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;
    private _buildRequestBody;
    private _extractContent;
    private _buildSystemPrompt;
    private _stubResponse;
}
