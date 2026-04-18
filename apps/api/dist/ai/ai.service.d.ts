export declare class AiService {
    private readonly logger;
    constructor();
    orchestrate(prompt: string, model?: string): Promise<{
        message: string;
    }>;
    analyzeSentiment(symbol: string): Promise<{
        symbol: string;
        message: string;
    }>;
}
