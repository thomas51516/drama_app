import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_ADMIN_ROUTE_KEY } from '../../common/decorators/admin-route.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { type RequestWithContext } from '../../common/request-context.js';
import { type AccessTokenPayload } from '../auth.types.js';

/**
 * Garde globale : exige un JWT d'accès valide sauf sur les routes `@Public()`.
 * Sur une route publique, un jeton valide renseigne tout de même `req.user`.
 * Les routes `@AdminRoute()` sont déléguées à `AdminAuthGuard` (JWT admin distinct).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAdminRoute =
      this.reflector.getAllAndOverride<boolean | undefined>(IS_ADMIN_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (isAdminRoute) return true;

    const isPublic =
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;

    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const token = extractBearer(req.headers.authorization);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Missing bearer token',
      });
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      if (payload.typ !== 'user' || typeof payload.sub !== 'string') {
        throw new Error('unexpected token subject');
      }
      req.user = { id: payload.sub, type: payload.ut };
      return true;
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      });
    }
  }
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : undefined;
}
