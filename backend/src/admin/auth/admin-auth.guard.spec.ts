import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config.js';
import { type Env } from '../../config/env.schema.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { ADMIN_ACCESS_AUDIENCE, AdminJwtService } from './admin-jwt.service.js';

const config = new AppConfig({
  ADMIN_JWT_SECRET: 'unit-test-admin-secret-0123456789abcdef',
  ADMIN_JWT_TTL_SECONDS: 3600,
  TOTP_ENCRYPTION_KEY: 'unit-test-totp-key-0123456789abcdef',
  TOTP_ISSUER: 'x',
} as unknown as Env);

function context(authorization: string | undefined, roles?: string[]) {
  const req: Record<string, unknown> = { headers: { authorization } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: vi.fn(() => roles) };
  return { ctx, req, reflector };
}

function makeGuard(role: string, roles?: string[], authorization?: string, revoked = false) {
  const jwt = new AdminJwtService(config);
  const prisma = {
    adminAccount: {
      findUnique: vi.fn(() =>
        Promise.resolve({ id: 'adm', email: 'e@x', displayName: 'E', role, isActive: true }),
      ),
    },
  };
  const auth = { isRevoked: vi.fn(() => Promise.resolve(revoked)) };
  const { ctx, req, reflector } = context(authorization, roles);
  const guard = new AdminAuthGuard(reflector as never, jwt, prisma as never, auth as never);
  return { guard, ctx, req, jwt };
}

async function adminToken(role = 'EDITOR'): Promise<string> {
  return new AdminJwtService(config).signAsync(
    { sub: 'adm', jti: 'j1', email: 'e@x', role },
    { audience: ADMIN_ACCESS_AUDIENCE, expiresIn: 60 },
  );
}

describe('AdminAuthGuard', () => {
  it('rejects a missing token and a user JWT signed with another secret / audience', async () => {
    const none = makeGuard('ADMIN');
    await expect(none.guard.canActivate(none.ctx)).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });

    const userJwt = await new JwtService({ secret: 'user-secret-0123456789abcdef0123' }).signAsync({
      sub: 'u1',
      typ: 'user',
    });
    const user = makeGuard('ADMIN', undefined, `Bearer ${userJwt}`);
    await expect(user.guard.canActivate(user.ctx)).rejects.toMatchObject({
      response: { code: 'INVALID_ADMIN_TOKEN' },
    });

    const challenge = await new AdminJwtService(config).signAsync(
      { sub: 'adm', jti: 'c1', setup: false },
      { audience: 'admin-challenge', expiresIn: 60 },
    );
    const wrongAud = makeGuard('ADMIN', undefined, `Bearer ${challenge}`);
    await expect(wrongAud.guard.canActivate(wrongAud.ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('enforces @Roles(): EDITOR cannot reach an ADMIN-only route, ADMIN can', async () => {
    const editor = makeGuard('EDITOR', ['ADMIN'], `Bearer ${await adminToken('EDITOR')}`);
    await expect(editor.guard.canActivate(editor.ctx)).rejects.toBeInstanceOf(ForbiddenException);

    const admin = makeGuard('ADMIN', ['ADMIN'], `Bearer ${await adminToken('ADMIN')}`);
    await expect(admin.guard.canActivate(admin.ctx)).resolves.toBe(true);
    expect(admin.req.admin).toMatchObject({ id: 'adm', role: 'ADMIN', jti: 'j1' });
  });

  it('rejects a revoked token', async () => {
    const g = makeGuard('ADMIN', undefined, `Bearer ${await adminToken('ADMIN')}`, true);
    await expect(g.guard.canActivate(g.ctx)).rejects.toMatchObject({
      response: { code: 'ADMIN_TOKEN_REVOKED' },
    });
  });
});
