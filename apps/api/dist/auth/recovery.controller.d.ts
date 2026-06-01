import { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
export declare class RecoveryController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    recoverSession(token: string, res: Response): Promise<void | Response<any, Record<string, any>>>;
}
