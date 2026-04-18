import { AiService } from './ai.service';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    orchestrate(body: {
        prompt: string;
        model?: string;
    }): Promise<{
        message: string;
    }>;
    analyzeSentiment(symbol: string): Promise<{
        symbol: string;
        message: string;
    }>;
}
