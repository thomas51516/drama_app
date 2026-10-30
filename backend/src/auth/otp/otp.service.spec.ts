import {
  GoneException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { type Env } from '../../config/env.schema.js';
import { type SmsProvider } from '../sms/sms-provider.js';
import {
  OTP_MAX_ATTEMPTS,
  otpDevCodeKey,
  otpRequestKey,
  otpResendKey,
  OtpService,
} from './otp.service.js';

/** Redis en mémoire : juste ce qu'utilise OtpService (set EX, get, ttl, del, multi). */
function fakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const now = () => Date.now();
  const alive = (key: string) => {
    const e = store.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  };
  const set = (key: string, value: string, _ex: string, seconds: number) => {
    store.set(key, { value, expiresAt: now() + seconds * 1000 });
    return Promise.resolve('OK');
  };
  const client = {
    store,
    set,
    get: (key: string) => Promise.resolve(alive(key)?.value ?? null),
    ttl: (key: string) => {
      const e = alive(key);
      return Promise.resolve(e ? Math.ceil((e.expiresAt - now()) / 1000) : -2);
    },
    del: (...keys: string[]) => Promise.resolve(keys.filter((k) => store.delete(k)).length),
    multi() {
      const ops: Array<() => Promise<unknown>> = [];
      const chain = {
        set: (k: string, v: string, ex: string, s: number) => {
          ops.push(() => set(k, v, ex, s));
          return chain;
        },
        exec: async () => {
          for (const op of ops) await op();
          return [];
        },
      };
      return chain;
    },
    expire: (key: string, seconds: number) => {
      const e = alive(key);
      if (e) e.expiresAt = now() + seconds * 1000;
      return Promise.resolve(e ? 1 : 0);
    },
  };
  return client;
}

function makeService(providerName: 'console' | 'http' = 'console') {
  const redis = fakeRedis();
  const sms: SmsProvider & { send: ReturnType<typeof vi.fn> } = {
    name: providerName,
    send: vi.fn(() => Promise.resolve()),
  };
  const config = new AppConfig({
    JWT_REFRESH_SECRET: 'unit-test-refresh-pepper-0123456789abcdef',
  } as unknown as Env);
  const service = new OtpService({ client: redis } as never, config, sms);
  return { service, redis, sms };
}

const PHONE = '+22890000001';

describe('OtpService', () => {
  it('request: stores a hashed 6-digit code, sends the SMS and exposes the code in Redis in console mode', async () => {
    const { service, redis, sms } = makeService();
    const result = await service.request(PHONE);

    expect(result).toMatchObject({ expiresIn: 300, resendAfter: 60 });
    expect(sms.send).toHaveBeenCalledTimes(1);
    const code = redis.store.get(otpDevCodeKey(result.requestId))?.value;
    expect(code).toMatch(/^\d{6}$/);
    expect(sms.send.mock.calls[0]?.[1]).toContain(code);
    const stored = JSON.parse(redis.store.get(otpRequestKey(result.requestId))!.value) as {
      phone: string;
      codeHash: string;
    };
    expect(stored.phone).toBe(PHONE);
    expect(stored.codeHash).not.toContain(code);
    expect(redis.store.has(otpResendKey(PHONE))).toBe(true);
  });

  it('request: never writes the clear code in Redis with the http provider', async () => {
    const { service, redis } = makeService('http');
    const result = await service.request(PHONE);
    expect(redis.store.has(otpDevCodeKey(result.requestId))).toBe(false);
  });

  it('request: refuses a second code within 60 s (429 OTP_RESEND_TOO_SOON)', async () => {
    const { service } = makeService();
    await service.request(PHONE);
    await expect(service.request(PHONE)).rejects.toMatchObject({
      status: 429,
      response: { code: 'OTP_RESEND_TOO_SOON' },
    });
    await expect(service.request(PHONE)).rejects.toBeInstanceOf(HttpException);
  });

  it('verify: accepts the right code once, then the request is consumed', async () => {
    const { service, redis } = makeService();
    const { requestId } = await service.request(PHONE);
    const code = redis.store.get(otpDevCodeKey(requestId))!.value;

    await expect(service.verify(requestId, code)).resolves.toBe(PHONE);
    await expect(service.verify(requestId, code)).rejects.toBeInstanceOf(NotFoundException);
    expect(redis.store.has(otpRequestKey(requestId))).toBe(false);
    expect(redis.store.has(otpDevCodeKey(requestId))).toBe(false);
  });

  it('verify: counts wrong attempts and burns the request after 5 (410 OTP_TOO_MANY_ATTEMPTS)', async () => {
    const { service, redis } = makeService();
    const { requestId } = await service.request(PHONE);
    const code = redis.store.get(otpDevCodeKey(requestId))!.value;
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 1; i < OTP_MAX_ATTEMPTS; i += 1) {
      await expect(service.verify(requestId, wrong)).rejects.toMatchObject({
        response: { code: 'OTP_INVALID_CODE', details: { attemptsLeft: OTP_MAX_ATTEMPTS - i } },
      });
    }
    await expect(service.verify(requestId, wrong)).rejects.toBeInstanceOf(GoneException);
    // Même le bon code ne passe plus : il faut redemander.
    await expect(service.verify(requestId, code)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('verify: unknown request → 404 OTP_REQUEST_NOT_FOUND', async () => {
    const { service } = makeService();
    await expect(
      service.verify('0192f1f0-8a5b-7c3d-9e1f-000000000000', '123456'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(UnauthorizedException).toBeDefined();
  });
});
