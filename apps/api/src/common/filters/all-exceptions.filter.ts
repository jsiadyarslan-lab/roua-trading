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
      details = exception.stack;

      // FIX: Always show Prisma error messages for debugging database schema issues
      const rawMessage = exception.message || '';
      const isPrismaError = rawMessage.includes('Prisma') || rawMessage.includes('prisma') || rawMessage.includes('database');

      // In production, hide internal error details for non-HttpException errors
      // EXCEPTION: Show Prisma error details to help debug schema mismatches
      if (process.env.NODE_ENV === 'production' && !isPrismaError) {
        message = 'Internal server error';
      } else {
        message = rawMessage || 'Internal server error';
      }

      // Classify common error types (applies user-friendly messages regardless of environment)
      if (rawMessage.includes('ECONNREFUSED') || rawMessage.includes('ETIMEDOUT')) {
        status = HttpStatus.BAD_GATEWAY;
        message = 'خدمة خارجية غير متاحة — يرجى المحاولة لاحقاً';
      } else if (
        rawMessage.includes('Prisma') ||
        rawMessage.includes('prisma') ||
        rawMessage.includes('database')
      ) {
        // Distinguish schema mismatch from connection errors
        if (
          rawMessage.includes('does not exist') ||
          rawMessage.includes('column') ||
          rawMessage.includes('schema') ||
          rawMessage.includes('relation') ||
          rawMessage.includes('Invalid')
        ) {
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'خطأ في هيكل قاعدة البيانات — يتم إصلاحه تلقائياً عند إعادة النشر';
        } else {
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'خطأ في قاعدة البيانات — يرجى المحاولة لاحقاً';
        }
      } else if (
        rawMessage.includes('Redis') ||
        rawMessage.includes('redis') ||
        rawMessage.includes('ECONNRESET')
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

    // TEMPORARY DEBUG: Include raw error details for Prisma/database errors
    // to diagnose 503 schema mismatch issues. Remove after fixing.
    if (exception instanceof Error) {
      const rawMsg = exception.message || '';
      if (rawMsg.includes('Prisma') || rawMsg.includes('prisma') || rawMsg.includes('column') || rawMsg.includes('does not exist')) {
        responseBody._debug = rawMsg.substring(0, 500);
      }
    }

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
