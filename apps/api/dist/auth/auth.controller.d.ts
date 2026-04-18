import { Request, Response } from 'express';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    private readonly logger;
    constructor(authService: AuthService);
    registerChallenge(body: {
        email: string;
        displayName?: string;
    }): Promise<{
        challenge: string;
        rp: {
            name: string;
            id: string;
        };
        user: {
            id: string;
            name: string;
            displayName: string;
        };
        pubKeyCredParams: {
            type: "public-key";
            alg: number;
        }[];
        timeout: number;
        attestation: "none";
        authenticatorSelection: {
            authenticatorAttachment: "platform";
            userVerification: "required";
            residentKey: "required";
        };
    }>;
    authChallenge(email: string): Promise<{
        challenge: string;
        rpId: string;
        allowCredentials: {
            type: "public-key";
            id: string;
            transports: "internal"[];
        }[];
        userVerification: "required";
        timeout: number;
    }>;
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
            tier: import("@prisma/client").$Enums.Tier;
        };
        error?: undefined;
    } | {
        error: string;
        success?: undefined;
        user?: undefined;
    }>;
    checkSession(req: Request): Promise<{
        authenticated: boolean;
        user: {
            id: string;
            email: string;
            displayName: string | null;
            tier: import("@prisma/client").$Enums.Tier;
        };
    } | {
        authenticated: boolean;
    }>;
    logout(req: Request, res: Response): Promise<{
        success: boolean;
    }>;
}
