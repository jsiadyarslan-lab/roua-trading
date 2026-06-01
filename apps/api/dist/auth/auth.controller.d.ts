import { Request, Response } from 'express';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    private readonly logger;
    constructor(authService: AuthService);
    registerChallenge(body: {
        email: string;
        displayName?: string;
    }): Promise<import("@simplewebauthn/server").PublicKeyCredentialCreationOptionsJSON>;
    authChallenge(email: string): Promise<import("@simplewebauthn/server").PublicKeyCredentialRequestOptionsJSON>;
    verify(body: {
        credential?: any;
        assertion?: any;
        email: string;
    }, req: Request, res: Response): Promise<{
        success: boolean;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import(".prisma/client").$Enums.Tier;
        };
        error?: undefined;
    } | {
        error: string;
        success?: undefined;
        user?: undefined;
    }>;
    checkSession(req: Request): Promise<any>;
    logout(req: Request, res: Response): Promise<{
        success: boolean;
    }>;
    refreshSession(req: Request, res: Response): Promise<{
        success: boolean;
        authenticated: boolean;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import(".prisma/client").$Enums.Tier;
        };
        data: {
            token: string;
            refresh: string | null;
        };
        error?: undefined;
    } | {
        authenticated: boolean;
        error: any;
        success?: undefined;
        user?: undefined;
        data?: undefined;
    }>;
    listSessions(req: Request): Promise<{
        sessions: {
            id: string;
            device: any;
            ipAddress: string | null;
            userAgent: string | null;
            createdAt: Date;
            expiresAt: Date;
            lastActive: Date;
            maskedIp: string | null;
        }[];
    }>;
    revokeSession(sessionId: string, req: Request): Promise<{
        success: boolean;
    } | {
        success: boolean;
        error: string;
    }>;
    revokeAllOtherSessions(req: Request): Promise<{
        success: boolean;
        revokedCount: number;
    } | {
        success: boolean;
        error: string;
    }>;
    cleanupSessions(): Promise<{
        cleaned: number;
    }>;
}
