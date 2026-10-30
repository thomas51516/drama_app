import { ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { type AdminAccount } from '../../generated/prisma/client.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { CreateAdminAccountDto } from './dto/admin-account.dto.js';

const me: AuthenticatedAdmin = {
  id: 'adm-1',
  email: 'admin@drama.local',
  displayName: 'Admin',
  role: 'ADMIN',
  jti: 'j',
  exp: 0,
};

function account(partial: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: 'adm-1',
    email: 'admin@drama.local',
    passwordHash: 'x',
    displayName: 'Admin',
    role: 'ADMIN',
    isActive: true,
    totpSecret: 'sealed',
    totpEnabledAt: new Date('2026-10-01T00:00:00Z'),
    lastLoginAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date(),
    ...partial,
  };
}

function makeService(accounts: AdminAccount[]) {
  const state = new Map(accounts.map((a) => [a.id, { ...a }]));
  const api = {
    findMany: vi.fn(() => Promise.resolve([...state.values()])),
    findUnique: vi.fn(({ where }: { where: { id?: string; email?: string } }) =>
      Promise.resolve(
        where.id
          ? (state.get(where.id) ?? null)
          : ([...state.values()].find((a) => a.email === where.email) ?? null),
      ),
    ),
    count: vi.fn(({ where }: { where: { id: { not: string } } }) =>
      Promise.resolve(
        [...state.values()].filter((a) => a.role === 'ADMIN' && a.isActive && a.id !== where.id.not)
          .length,
      ),
    ),
    create: vi.fn(({ data }: { data: Partial<AdminAccount> }) =>
      Promise.resolve(account({ id: 'new', totpSecret: null, totpEnabledAt: null, ...data })),
    ),
    update: vi.fn(({ where, data }: { where: { id: string }; data: Partial<AdminAccount> }) => {
      const next = { ...(state.get(where.id) as AdminAccount), ...data };
      state.set(where.id, next);
      return Promise.resolve(next);
    }),
  };
  const prisma = {
    adminAccount: api,
    auditLog: {
      findMany: vi.fn(() => Promise.resolve([])),
      count: vi.fn(() => Promise.resolve(0)),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({ adminAccount: api })),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const devices = { revokeAll: vi.fn(() => Promise.resolve(1)) };
  const service = new AdminAccountsService(prisma as never, audit as never, devices as never);
  return { service, prisma, audit, api, devices };
}

describe('AdminAccountsService guards', () => {
  it('refuses self-deactivation and self-demotion (ADMIN_SELF_LOCKOUT)', async () => {
    const { service } = makeService([account(), account({ id: 'adm-2', email: 'b@drama.local' })]);
    await expect(service.update('adm-1', { isActive: false }, me)).rejects.toMatchObject({
      response: { code: 'ADMIN_SELF_LOCKOUT' },
    });
    await expect(service.update('adm-1', { role: 'EDITOR' }, me)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses to deactivate or demote the last active ADMIN (LAST_ADMIN)', async () => {
    const { service } = makeService([
      account(),
      account({ id: 'adm-2', email: 'b@drama.local' }),
      account({ id: 'adm-3', email: 'c@drama.local', isActive: false }),
    ]);
    const other: AuthenticatedAdmin = { ...me, id: 'adm-2', email: 'b@drama.local' };
    // adm-2 désactive adm-1 : il reste adm-2 actif → OK.
    await expect(service.update('adm-1', { isActive: false }, other)).resolves.toMatchObject({
      isActive: false,
    });
    // Puis plus personne d'autre : rétrograder adm-2 lui-même est un auto-verrouillage,
    // et rétrograder adm-2 depuis adm-1 (désactivé) serait le dernier admin.
    await expect(service.update('adm-2', { role: 'SUPPORT' }, me)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows renaming without touching the admin guards and audits the diff', async () => {
    const { service, audit } = makeService([account()]);
    await expect(
      service.update('adm-1', { displayName: 'Boss' }, me, '1.2.3.4'),
    ).resolves.toMatchObject({
      displayName: 'Boss',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin_account.update',
        oldValue: { displayName: 'Admin' },
        newValue: { displayName: 'Boss' },
        ip: '1.2.3.4',
      }),
      expect.anything(),
    );
  });

  it('rejects duplicate e-mails and hashes the password on creation', async () => {
    const { service, api, audit } = makeService([account()]);
    await expect(
      service.create(
        {
          email: 'admin@drama.local',
          displayName: 'Dup',
          role: 'EDITOR',
          password: 'Abcdefghij1!',
        },
        me,
      ),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_EMAIL_TAKEN' } });

    const created = await service.create(
      { email: 'new@drama.local', displayName: 'New', role: 'EDITOR', password: 'Abcdefghij1!' },
      me,
    );
    expect(created).toMatchObject({
      email: 'new@drama.local',
      role: 'EDITOR',
      totpEnrolled: false,
    });
    const data = (api.create.mock.calls[0][0] as { data: { passwordHash: string } }).data;
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin_account.create', targetId: 'new' }),
      expect.anything(),
    );
  });

  it('reset-totp clears the secret and the enrolment date', async () => {
    const { service, api } = makeService([account({ id: 'adm-2', email: 'b@drama.local' })]);
    const result = await service.resetTotp('adm-2', me);
    expect(result.totpEnrolled).toBe(false);
    expect(api.update).toHaveBeenCalledWith({
      where: { id: 'adm-2' },
      data: { totpSecret: null, totpEnabledAt: null },
    });
  });

  it('reset-password stores a new Argon2id hash and never logs the value', async () => {
    const { service, api, audit } = makeService([account({ id: 'adm-2', email: 'b@drama.local' })]);
    await service.resetPassword('adm-2', { password: 'NewPassword!2026' }, me);
    const data = (api.update.mock.calls[0][0] as { data: { passwordHash: string } }).data;
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    const entry = audit.record.mock.calls[0][0] as { action: string; newValue?: unknown };
    expect(entry.action).toBe('admin_account.reset_password');
    expect(JSON.stringify(entry)).not.toContain('NewPassword');
  });
});

describe('CreateAdminAccountDto password policy', () => {
  it('requires at least 10 characters', async () => {
    const short = plainToInstance(CreateAdminAccountDto, {
      email: 'X@Drama.local',
      displayName: ' Nom ',
      role: 'EDITOR',
      password: 'Abcdefghi',
    });
    const errors = await validate(short);
    expect(errors.map((e) => e.property)).toEqual(['password']);
    expect(short.email).toBe('x@drama.local');
    expect(short.displayName).toBe('Nom');

    const ok = plainToInstance(CreateAdminAccountDto, {
      email: 'x@drama.local',
      displayName: 'Nom',
      role: 'EDITOR',
      password: 'Abcdefghij',
    });
    expect(await validate(ok)).toEqual([]);
  });
});

describe('AdminAccountsService.listAuditLogs', () => {
  it('builds the filters: exact or prefixed action, actor, target, period, pagination', async () => {
    const { service, prisma } = makeService([]);
    await service.listAuditLogs({
      page: 2,
      pageSize: 25,
      actorId: 'adm-1',
      action: 'series.',
      targetType: 'series',
      targetId: 's1',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.000Z',
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        actorId: 'adm-1',
        action: { startsWith: 'series.' },
        targetType: 'series',
        targetId: 's1',
        createdAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lte: new Date('2026-10-31T23:59:59.000Z'),
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 25,
      take: 25,
    });
    await service.listAuditLogs({ page: 1, pageSize: 50, action: 'series.update' });
    expect(prisma.auditLog.count).toHaveBeenLastCalledWith({ where: { action: 'series.update' } });
  });
});
