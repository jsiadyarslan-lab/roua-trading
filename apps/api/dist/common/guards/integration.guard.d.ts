import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
export declare const IS_INTEGRATION_KEY = "isIntegrationRoute";
export declare const IntegrationRoute: () => import("@nestjs/common").CustomDecorator<string>;
export declare class IntegrationGuard implements CanActivate {
    private readonly reflector;
    private readonly logger;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
