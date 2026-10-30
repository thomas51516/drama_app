import { AppConfig } from '../../config/app-config.js';
import { type Env } from '../../config/env.schema.js';
import { type AdminTrustedDevice } from '../../generated/prisma/client.js';
import { TrustedDeviceService } from './trusted-device.service.js';

const config = new AppConfig({ TRUSTED_DEVICE_DAYS: 30 } as unknown as Env);
const me = {
  id: 'adm-1',
  email: 'a@drama.local',
  displayName: 'A',
  role: 'ADMIN',
  jti: 'j',
  exp: 0,
} as const;

function makeService() {
  const store = new Map<string, AdminTrustedDevice>();
  let seq = 0;
  const api = {
    create: vi.fn(({ data }: { data: Partial<AdminTrustedDevice> }) => {
      const row = {
        id: `dev-${++seq}`,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
        ...data,
      } as AdminTrustedDevice;
      store.set(row.id, row);
      return Promise.resolve(row);
    }),
    findUnique: vi.fn(({ where }: { where: { tokenHash: string } }) =>
      Promise.resolve([...store.values()].find((d) => d.tokenHash === where.tokenHash) ?? null),
    ),
    findFirst: vi.fn(({ where }: { where: { id: string; adminId: string } }) => {
      const d = store.get(where.id);
      return Promise.resolve(d && d.adminId === where.adminId && !d.revokedAt ? d : null);
    }),
    findMany: vi.fn(({ where }: { where: { adminId: string } }) =>
      Promise.resolve(
        [...store.values()].filter(
          (d) => d.adminId === where.adminId && !d.revokedAt && d.expiresAt > new Date(),
        ),
      ),
    ),
    update: vi.fn(
      ({ where, data }: { where: { id: string }; data: Partial<AdminTrustedDevice> }) => {
        const next = { ...(store.get(where.id) as AdminTrustedDevice), ...data };
        store.set(where.id, next);
        return Promise.resolve(next);
      },
    ),
    updateMany: vi.fn(
      ({ where, data }: { where: { adminId: string }; data: { revokedAt: Date } }) => {
        let count = 0;
        for (const d of store.values()) {
          if (d.adminId === where.adminId && !d.revokedAt) {
            d.revokedAt = data.revokedAt;
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    ),
  };
  const prisma = {
    adminTrustedDevice: api,
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({ adminTrustedDevice: api })),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new TrustedDeviceService(prisma as never, config, audit as never);
  return { service, store, audit, api };
}

describe('TrustedDeviceService (B-13+)', () => {
  it('issues a 256-bit token stored hashed, valid 30 days, labelled from the User-Agent', async () => {
    const { service, store, audit } = makeService();
    const issued = await service.issue('adm-1', {
      ip: '::1',
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    });
    expect(Buffer.from(issued.token, 'base64url')).toHaveLength(32);
    const [row] = [...store.values()];
    expect(row?.tokenHash).toBe(TrustedDeviceService.hash(issued.token));
    expect(row?.tokenHash).not.toContain(issued.token);
    expect(row?.label).toBe('Chrome sur Linux');
    const days = (issued.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.device_trusted',
        targetType: 'admin_trusted_device',
      }),
    );
  });

  it('verify: accepts the owner only, touches lastUsedAt, rejects revoked and expired devices', async () => {
    const { service, store } = makeService();
    const { token } = await service.issue('adm-1');
    expect(await service.verify('adm-2', token)).toBeNull();
    expect(await service.verify('adm-1', 'not-a-token')).toBeNull();
    const ok = await service.verify('adm-1', token);
    expect(ok?.lastUsedAt).toBeInstanceOf(Date);

    const list = await service.list('adm-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ok?.id, label: 'Navigateur inconnu' });

    await service.revoke(me, ok!.id);
    expect(await service.verify('adm-1', token)).toBeNull();
    expect(await service.list('adm-1')).toEqual([]);
    await expect(service.revoke(me, ok!.id)).rejects.toMatchObject({
      response: { code: 'DEVICE_NOT_FOUND' },
    });

    const { token: second } = await service.issue('adm-1');
    const row = [...store.values()].find((d) => d.tokenHash === TrustedDeviceService.hash(second))!;
    row.expiresAt = new Date(Date.now() - 1000);
    expect(await service.verify('adm-1', second)).toBeNull();
  });

  it('revokeAll revokes every active device of the account and nothing else', async () => {
    const { service } = makeService();
    const a1 = await service.issue('adm-1');
    const a2 = await service.issue('adm-1');
    const b = await service.issue('adm-2');
    expect(await service.revokeAll('adm-1')).toBe(2);
    expect(await service.verify('adm-1', a1.token)).toBeNull();
    expect(await service.verify('adm-1', a2.token)).toBeNull();
    expect(await service.verify('adm-2', b.token)).not.toBeNull();
    expect(await service.revokeAll('adm-1')).toBe(0);
  });

  it('labels common browsers and systems', () => {
    expect(TrustedDeviceService.labelFrom('Mozilla/5.0 (Windows NT 10.0) Firefox/131.0')).toBe(
      'Firefox sur Windows',
    );
    expect(
      TrustedDeviceService.labelFrom(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17 Safari/604.1',
      ),
    ).toBe('Safari sur iOS');
    expect(TrustedDeviceService.labelFrom(undefined)).toBe('Navigateur inconnu');
  });
});
