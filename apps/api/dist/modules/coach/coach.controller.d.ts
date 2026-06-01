import { CoachService } from './coach.service';
export declare class CoachController {
    private readonly coachService;
    private readonly logger;
    constructor(coachService: CoachService);
    getPerformanceAdvice(req: any): Promise<{
        success: boolean;
        data: {
            id: string;
            rating: string;
            statistics: import("./coach.service").TradeStats;
            adviceText: string;
            adviceItems: {
                type: string;
                icon: string;
                text: string;
            }[];
            createdAt: Date;
        };
    }>;
    askCoach(req: any, body: {
        question: string;
        contextAdviceId?: string;
    }): Promise<{
        success: boolean;
        data: {
            question: string;
            answer: string;
            model: string;
        };
    }>;
    getAdviceHistory(req: any): Promise<{
        success: boolean;
        data: {
            id: string;
            rating: string;
            adviceText: string;
            adviceItems: any;
            statistics: any;
            isRead: boolean;
            createdAt: Date;
        }[];
    }>;
}
