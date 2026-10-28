import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { captureException } from '../../observability/sentry.js';
import { type ApiErrorDto } from '../dto/api-error.dto.js';
import { type RequestWithContext } from '../request-context.js';

function defaultCode(status: number): string {
  const name = HttpStatus[status] as string | undefined;
  return name ?? 'ERROR';
}

/** Normalise toute exception vers le format ApiErrorDto et journalise les 5xx. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithContext>();
    const body = this.toBody(exception, req);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${body.statusCode} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      captureException(exception, {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        code: body.code,
      });
    }

    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, req: RequestWithContext): ApiErrorDto {
    const base = {
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    };

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { statusCode, code: defaultCode(statusCode), message: response, ...base };
      }
      const r = response as Record<string, unknown>;
      if (Array.isArray(r.message)) {
        // ValidationPipe (class-validator)
        return {
          statusCode,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { errors: r.message as string[] },
          ...base,
        };
      }
      return {
        statusCode,
        code: typeof r.code === 'string' ? r.code : defaultCode(statusCode),
        message: typeof r.message === 'string' ? r.message : exception.message,
        details: isRecord(r.details) ? r.details : undefined,
        ...base,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { statusCode: 409, code: 'CONFLICT', message: 'Resource already exists', ...base };
      }
      if (exception.code === 'P2025') {
        return { statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found', ...base };
      }
    }

    return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error', ...base };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
