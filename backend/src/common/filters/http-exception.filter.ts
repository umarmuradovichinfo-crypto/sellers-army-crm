import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

// TZ §2.1: barcha xatolar { error, message, details? } ko'rinishida
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'INTERNAL_ERROR';
    let message = 'Server xatosi';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();

      if (typeof resp === 'string') {
        message = resp;
        error = codeForStatus(status);
      } else if (resp && typeof resp === 'object') {
        const r = resp as {
          message?: string | string[];
          error?: string;
          details?: unknown;
        };
        if (Array.isArray(r.message)) {
          // class-validator validatsiya xatolari
          error = 'VALIDATION_ERROR';
          message = r.message[0] ?? 'Validatsiya xatosi';
          details = r.message;
        } else {
          message = r.message ?? message;
          error = r.error ?? codeForStatus(status);
          details = r.details;
        }
      }
    } else {
      this.logger.error(exception);
    }

    res.status(status).json({
      error,
      message,
      ...(details ? { details } : {}),
    });
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE';
    default:
      return 'ERROR';
  }
}
