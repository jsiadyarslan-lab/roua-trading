import { CredentialsService } from './credentials.service';
declare class AddCredentialDto {
    exchange: string;
    label: string;
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
    testnet?: boolean;
    keyType?: string;
}
export declare class CredentialsController {
    private readonly credentialsService;
    private readonly logger;
    constructor(credentialsService: CredentialsService);
    private assertRealUser;
    getCredentials(req: any): Promise<{
        success: boolean;
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            exchange: string;
            label: string;
            permissions: string;
            isValid: boolean;
            lastValidatedAt: Date | null;
        }[];
    }>;
    updateCredential(credentialId: string, req: any, body: {
        testnet?: boolean;
    }): Promise<{
        success: boolean;
        data: {
            keyType: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            exchange: string;
            label: string;
            encryptedApiKey: string;
            encryptedSecret: string;
            iv: string;
            authTag: string;
            secretIv: string | null;
            secretAuthTag: string | null;
            encryptedPassphrase: string | null;
            passphraseIv: string | null;
            passphraseAuthTag: string | null;
            permissions: string;
            isValid: boolean;
            lastValidatedAt: Date | null;
            testnet: boolean;
        };
    }>;
    addCredential(req: any, body: AddCredentialDto): Promise<{
        success: boolean;
        data: {
            id: string;
            exchange: string;
            label: string;
            permissions: string;
            isValid: boolean;
            lastValidatedAt: Date | null;
            createdAt: Date;
        };
    }>;
    getBalances(req: any): Promise<{
        success: boolean;
        data: {
            totalEquityUsd: number;
            totalAvailableUsd: number;
            totalUsedMargin: number;
            exchanges: Array<{
                exchange: string;
                label: string;
                credentialId: string;
                isTestnet: boolean;
                equity: number;
                available: number;
                currency: string;
                usedMargin: number;
                paperBalance?: number;
                assets: Array<{
                    currency: string;
                    free: number;
                    used: number;
                    total: number;
                }>;
                error?: string;
                errorDetail?: string;
            }>;
            allRealExchangesFailed?: boolean;
            hasRealCredentials?: boolean;
        };
    }>;
    deleteCredential(req: any, id: string): Promise<{
        success: boolean;
    }>;
    getServerIp(): Promise<{
        success: boolean;
        data: {
            serverIp: string;
            instructions: {
                en: string;
                ar: string;
            };
            error?: undefined;
        };
    } | {
        success: boolean;
        data: {
            serverIp: string;
            error: any;
            instructions?: undefined;
        };
    }>;
    testConnectivity(req: any): Promise<{
        success: boolean;
        data: {
            serverTime: string;
            serverUptime: number;
            connectivity: ({
                exchange: string;
                reachable: boolean;
                latencyMs: number;
                error?: string;
                errorType?: string;
                serverTime?: number;
                serverIp?: string;
                authTest?: {
                    success: boolean;
                    latencyMs: number;
                    error?: string;
                    errorType?: string;
                    balanceEquity?: number;
                    hasCredentials: boolean;
                };
            } | {
                error: any;
            })[];
            credentialsStatus: any;
        };
    }>;
}
export {};
