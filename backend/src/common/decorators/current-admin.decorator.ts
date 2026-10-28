import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthenticatedAdmin, type RequestWithContext } from '../request-context.js';

/** Injecte le compte interne authentifié (routes protégées par `AdminAuthGuard`). */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin =>
    ctx.switchToHttp().getRequest<RequestWithContext>().admin as AuthenticatedAdmin,
);
