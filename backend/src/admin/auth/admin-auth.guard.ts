import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { type RequestWithContext } from '../../common/request-context.js';
import { type AdminRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdminAuthService } from './admin-auth.service.js';
import { type AdminAccessPayload } from './admin-auth.types.js';
import { ADMIN_ACCESS_AUDIENCE, AdminJwtService } from './admin-jwt.service.js';

/**
 * Garde des routes /admin/* : JWT admin valide (`aud: admin`), non révoqué, compte actif,
 * rôle autorisé par `@Roles()`. À appliquer avec `@AdminRoute()` (voir AdminController).
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: AdminJwtService,
    private readonly prisma: PrismaService,
    private readonly auth: AdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Missing bearer token' });
    }

    let payload: AdminAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminAccessPayload>(token, {
        audience: ADMIN_ACCESS_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ADMIN_TOKEN',
        message: 'Invalid or expired admin token',
      });
    }
    if (await this.auth.isRevoked(payload.jti)) {
      throw new UnauthorizedException({ code: 'ADMIN_TOKEN_REVOKED', message: 'Token revoked' });
    }

    const account = await this.prisma.adminAccount.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, displayName: true, role: true, isActive: true },
    });
    if (!account?.isActive) {
      throw new UnauthorizedException({ code: 'ADMIN_INACTIVE', message: 'Account is disabled' });
    }

    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.includes(account.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: `This action requires one of the roles: ${roles.join(', ')}`,
        details: { requiredRoles: roles, role: account.role },
      });
    }

    req.admin = {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      jti: payload.jti,
      exp: payload.exp ?? Math.floor(Date.now() / 1000),
    };
    return true;
  }
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : undefined;
}
