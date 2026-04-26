import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Global Exception Filter — Roua Trading
 *
 * Catches ALL unhandled exceptions and returns a structured JSON response
 * with the actual error message (not just "Internal server error").
 *
 * In development mode, includes stack trace for easier debugging.
 * In production, hides stack trace but still shows the error message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message =
          (resp.message as string) ||
          (resp.error as string) ||
          exception.message ||
          'Internal server error';
        // If message is an array (e.g., validation errors), join them
        if (Array.isArray(message)) {
          message = message.join('; ');
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'Internal server error';
      details = exception.stack;

      // Classify common error types
      if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
        status = HttpStatus.BAD_GATEWAY;
        message = 'خدمة خارجية غير متاحة — يرجى المحاولة لاحقاً';
      } else if (
        message.includes('Prisma') ||
        message.includes('prisma') ||
        message.includes('database')
      ) {
        // Distinguish schema mismatch from connection errors
        if (
          message.includes('does not exist') ||
          message.includes('column') ||
          message.includes('schema') ||
          message.includes('relation') ||
          message.includes('Invalid')
        ) {
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'خطأ في هيكل قاعدة البيانات — يتم إصلاحه تلقائياً عند إعادة النشر';
        } else {
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'خطأ في قاعدة البيانات — يرجى المحاولة لاحقاً';
        }
      } else if (
        message.includes('Redis') ||
        message.includes('redis') ||
        message.includes('ECONNRESET')
      ) {
        status = HttpStatus.BAD_GATEWAY;
        message = 'خطأ في الاتصال بالذاكرة المؤقتة — يرجى المحاولة لاحقاً';
      }
    }

    // Log the full error for server-side debugging
    this.logger.error(
      `[${request.method}] ${request.url} → ${status}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Build response
    const responseBody: Record<string, unknown> = {
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // In development, include error details for debugging
    if (
      process.env.NODE_ENV !== 'production' &&
      details
    ) {
      responseBody.details = details;
    }

    // Ensure response is sent (check if headers already sent)
    if (!response.headersSent) {
      response.status(status).json(responseBody);
    }
  }
}
