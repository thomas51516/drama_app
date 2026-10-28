import { type ExecutionContext, HttpException } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { type Env } from '../../config/env.schema.js';
import { type RateLimitRule } from './rate-limit.decorator.js';
import { RateLimitGuard } from './rate-limit.guard.js';

function makeGuard(
  rules: RateLimitRule[] | undefined,
  opts: { fail?: boolean; enabled?: boolean } = {},
) {
  const counters = new Map<string, number>();
  const expires = new Map<string, number>();
  const client = {
    multi: () => {
      const ops: Array<() => unknown> = [];
      const chain = {
        incr: (key: string) => {
          ops.push(() => {
            counters.set(key, (counters.get(key) ?? 0) + 1);
            return counters.get(key);
          });
          return chain;
        },
        pttl: (key: string) => {
          ops.push(() => expires.get(key) ?? -1);
          return chain;
        },
        exec: () =>
          opts.fail
            ? Promise.reject(new Error('ECONNREFUSED'))
            : Promise.resolve(ops.map((op) => [null, op()])),
      };
      return chain;
    },
    pexpire: vi.fn((key: string, ms: number) => {
      expires.set(key, ms);
      return Promise.resolve(1);
    }),
  };
  const headers: Record<string, string> = {};
  const req = { ip: '1.2.3.4', body: { email: 'Admin@Drama.local' }, socket: {} };
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => 'h',
    getClass: () => 'c',
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: () => rules };
  const config = new AppConfig({ RATE_LIMIT_ENABLED: opts.enabled ?? true } as unknown as Env);
  const guard = new RateLimitGuard(reflector as never, { client } as never, config);
  return { guard, ctx, headers, counters, client };
}

describe('RateLimitGuard', () => {
  it('allows up to the limit then answers 429 RATE_LIMITED with Retry-After', async () => {
    const rule: RateLimitRule = {
      name: 'admin_login',
      limit: 2,
      windowSeconds: 900,
      scope: 'email',
    };
    const { guard, ctx, headers, counters, client } = makeGuard([rule]);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(headers['X-RateLimit-Remaining']).toBe('0');
    expect(client.pexpire).toHaveBeenCalledTimes(1);
    expect([...counters.keys()]).toEqual(['rl:admin_login:email:admin@drama.local']);

    const err = await guard.canActivate(ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { rule: 'admin_login', retryAfterSeconds: 900 },
    });
    expect(headers['Retry-After']).toBe('900');
  });

  it('applies several rules (per IP and per e-mail) on the same route', async () => {
    const { guard, ctx, counters } = makeGuard([
      { name: 'a', limit: 5, windowSeconds: 60, scope: 'ip' },
      { name: 'b', limit: 5, windowSeconds: 60, scope: 'email' },
    ]);
    await guard.canActivate(ctx);
    expect([...counters.keys()]).toEqual(['rl:a:ip:1.2.3.4', 'rl:b:email:admin@drama.local']);
  });

  it('is a no-op without rules or when disabled, and fails open when Redis is down', async () => {
    const none = makeGuard(undefined);
    await expect(none.guard.canActivate(none.ctx)).resolves.toBe(true);
    const disabled = makeGuard([{ name: 'x', limit: 0, windowSeconds: 1, scope: 'ip' }], {
      enabled: false,
    });
    await expect(disabled.guard.canActivate(disabled.ctx)).resolves.toBe(true);
    const down = makeGuard([{ name: 'x', limit: 0, windowSeconds: 1, scope: 'ip' }], {
      fail: true,
    });
    await expect(down.guard.canActivate(down.ctx)).resolves.toBe(true);
  });
});
