"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger(AllExceptionsFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let details;
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            }
            else if (typeof exceptionResponse === 'object') {
                const resp = exceptionResponse;
                message =
                    resp.message ||
                        resp.error ||
                        exception.message ||
                        'Internal server error';
                if (Array.isArray(message)) {
                    message = message.join('; ');
                }
            }
        }
        else if (exception instanceof Error) {
            details = exception.stack;
            const rawMessage = exception.message || '';
            if (process.env.NODE_ENV === 'production') {
                message = rawMessage || 'Internal server error';
            }
            else {
                message = rawMessage || 'Internal server error';
            }
            if (rawMessage.includes('ECONNREFUSED') || rawMessage.includes('ETIMEDOUT')) {
                status = common_1.HttpStatus.BAD_GATEWAY;
                message = 'خدمة خارجية غير متاحة — يرجى المحاولة لاحقاً';
            }
            else if (rawMessage.includes('Prisma') ||
                rawMessage.includes('prisma') ||
                rawMessage.includes('database')) {
                if (rawMessage.includes('does not exist') ||
                    rawMessage.includes('column') ||
                    rawMessage.includes('schema') ||
                    rawMessage.includes('relation') ||
                    rawMessage.includes('Invalid')) {
                    status = common_1.HttpStatus.SERVICE_UNAVAILABLE;
                    message = 'خطأ في هيكل قاعدة البيانات — يتم إصلاحه تلقائياً عند إعادة النشر: ' + rawMessage;
                }
                else {
                    status = common_1.HttpStatus.SERVICE_UNAVAILABLE;
                    message = 'خطأ في قاعدة البيانات — يرجى المحاولة لاحقاً';
                }
            }
            else if (rawMessage.includes('Redis') ||
                rawMessage.includes('redis') ||
                rawMessage.includes('ECONNRESET')) {
                status = common_1.HttpStatus.BAD_GATEWAY;
                message = 'خطأ في الاتصال بالذاكرة المؤقتة — يرجى المحاولة لاحقاً';
            }
        }
        this.logger.error(`[${request.method}] ${request.url} → ${status}: ${message}`, exception instanceof Error ? exception.stack : undefined);
        const responseBody = {
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
            path: request.url,
        };
        if (process.env.NODE_ENV !== 'production' &&
            details) {
            responseBody.details = details;
        }
        if (!response.headersSent) {
            response.status(status).json(responseBody);
        }
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map