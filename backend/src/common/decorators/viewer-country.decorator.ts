import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';

/**
 * En-tête `X-Country` validé (DEF-008) : absent → `undefined` ; sinon exactement deux lettres
 * (ISO 3166-1 alpha-2, casse ignorée) renvoyées en majuscules, ou `400 VALIDATION_ERROR`.
 */
export const ViewerCountry = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const raw = req.headers['x-country'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value.trim() === '') return undefined;
    const code = value.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { errors: ['X-Country must be an ISO 3166-1 alpha-2 country code'] },
      });
    }
    return code;
  },
);
