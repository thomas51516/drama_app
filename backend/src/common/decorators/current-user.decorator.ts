import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthenticatedUser, type RequestWithContext } from '../request-context.js';

/** Injecte l'utilisateur authentifié (ou `undefined` sur une route publique sans jeton). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined =>
    ctx.switchToHttp().getRequest<RequestWithContext>().user,
);
