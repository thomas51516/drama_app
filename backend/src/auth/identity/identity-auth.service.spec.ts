import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { type User, type UserIdentity } from '../../generated/prisma/client.js';
import { IdentityAuthService, normalizeEmail } from './identity-auth.service.js';

const GUEST_ID = '0192f1f0-8a5b-7c3d-9e1f-00000000a001';
const OWNER_ID = '0192f1f0-8a5b-7c3d-9e1f-00000000a002';

function user(partial: Partial<User> = {}): User {
  return {
    id: GUEST_ID,
    type: 'GUEST',
    status: 'ACTIVE',
    phone: null,
    email: null,
    passwordHash: null,
    displayName: null,
    country: 'TG',
    language: 'fr',
    deviceId: 'device-123456',
    isVip: false,
    vipExpiresAt: null,
    autoUnlock: false,
    notificationPreferences: null,
    deletionScheduledAt: null,
    mergedIntoId: null,
    lastSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function makeService(opts: {
  identity?: (UserIdentity & { user: User }) | null;
  current?: User | null;
}) {
  const tx = {
    userIdentity: { create: vi.fn(() => Promise.resolve({})) },
    user: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(user({ id: 'new-user', type: data.type as User['type'] })),
      ),
      update: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(user({ id: where.id, type: 'REGISTERED' })),
      ),
      findUnique: vi.fn(() => Promise.resolve(null)),
    },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    userIdentity: { findUnique: vi.fn(() => Promise.resolve(opts.identity ?? null)) },
    user: {
      findUnique: vi.fn(({ where }: { where: { id?: string } }) =>
        Promise.resolve(
          where.id === opts.current?.id ? opts.current : where.id === OWNER_ID ? owner : null,
        ),
      ),
    },
  };
  const owner = opts.identity?.user ?? null;
  const auth = {
    openSession: vi.fn((userId: string, o: { linked: boolean }) =>
      Promise.resolve({ user: { id: userId }, linked: o.linked }),
    ),
  };
  const merge = { merge: vi.fn(() => Promise.resolve({})) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new IdentityAuthService(
    prisma as never,
    auth as never,
    merge as never,
    audit as never,
  );
  return { service, prisma, tx, auth, merge, audit };
}

const identityRow = (u: User): UserIdentity & { user: User } => ({
  id: 'ident-1',
  userId: u.id,
  provider: 'GOOGLE',
  subject: 'google-sub-1',
  createdAt: new Date(),
  user: u,
});

const ctx = (current?: User) => ({
  current: current ? { id: current.id, type: current.type } : undefined,
  deviceId: 'device-123456',
});

describe('IdentityAuthService linking rules (M-50)', () => {
  it('unknown identity + guest token → the guest becomes REGISTERED in place (linked=true)', async () => {
    const guest = user();
    const { service, tx, auth, merge } = makeService({ identity: null, current: guest });

    const session = await service.signIn(
      { provider: 'GOOGLE', subject: 'google-sub-1', email: 'awa@example.com', displayName: 'Awa' },
      ctx(guest),
    );

    expect(tx.userIdentity.create).toHaveBeenCalledWith({
      data: { userId: GUEST_ID, provider: 'GOOGLE', subject: 'google-sub-1' },
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GUEST_ID },
        data: expect.objectContaining({
          type: 'REGISTERED',
          email: 'awa@example.com',
          displayName: 'Awa',
        }),
      }),
    );
    expect(merge.merge).not.toHaveBeenCalled();
    expect(auth.openSession).toHaveBeenCalledWith(
      GUEST_ID,
      expect.objectContaining({ linked: true }),
    );
    expect(session.linked).toBe(true);
  });

  it('identity owned by another account + guest token → guest merged into that account (linked=true)', async () => {
    const guest = user();
    const owner = user({ id: OWNER_ID, type: 'REGISTERED' });
    const { service, auth, merge, tx } = makeService({
      identity: identityRow(owner),
      current: guest,
    });

    const session = await service.signIn(
      { provider: 'GOOGLE', subject: 'google-sub-1' },
      ctx(guest),
    );

    expect(merge.merge).toHaveBeenCalledWith(tx, guest, owner, undefined);
    expect(auth.openSession).toHaveBeenCalledWith(
      OWNER_ID,
      expect.objectContaining({ linked: true }),
    );
    expect(session.user.id).toBe(OWNER_ID);
  });

  it('identity owned by another account + REGISTERED token → plain sign-in, no merge (linked=false)', async () => {
    const registered = user({ type: 'REGISTERED' });
    const owner = user({ id: OWNER_ID, type: 'REGISTERED' });
    const { service, auth, merge } = makeService({
      identity: identityRow(owner),
      current: registered,
    });

    const session = await service.signIn(
      { provider: 'GOOGLE', subject: 'google-sub-1' },
      ctx(registered),
    );

    expect(merge.merge).not.toHaveBeenCalled();
    expect(session).toMatchObject({ user: { id: OWNER_ID }, linked: false });
    expect(auth.openSession).toHaveBeenCalledTimes(1);
  });

  it('identity already owned by the caller → session on the same account (linked=false)', async () => {
    const owner = user({ id: OWNER_ID, type: 'REGISTERED' });
    const { service, merge, tx } = makeService({ identity: identityRow(owner), current: owner });
    const session = await service.signIn(
      { provider: 'GOOGLE', subject: 'google-sub-1' },
      ctx(owner),
    );
    expect(session).toMatchObject({ user: { id: OWNER_ID }, linked: false });
    expect(merge.merge).not.toHaveBeenCalled();
    expect(tx.userIdentity.create).not.toHaveBeenCalled();
  });

  it('unknown identity without token → new REGISTERED account with wallet and identity (linked=false)', async () => {
    const { service, tx, auth } = makeService({ identity: null, current: null });
    const session = await service.signIn(
      { provider: 'PHONE', subject: '+22890000000', phone: '+22890000000' },
      ctx(),
    );
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REGISTERED',
          wallet: { create: {} },
          identities: { create: { provider: 'PHONE', subject: '+22890000000' } },
        }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+22890000000' }) }),
    );
    expect(auth.openSession).toHaveBeenCalledWith(
      'new-user',
      expect.objectContaining({ linked: false }),
    );
    expect(session.linked).toBe(false);
  });

  it('a non-ACTIVE guest token is ignored (no link, no merge)', async () => {
    const pending = user({ status: 'DELETION_PENDING' });
    const { service, tx, merge } = makeService({ identity: null, current: pending });
    await service.signIn({ provider: 'GOOGLE', subject: 'google-sub-1' }, ctx(pending));
    expect(tx.userIdentity.create).not.toHaveBeenCalled();
    expect(tx.user.create).toHaveBeenCalled();
    expect(merge.merge).not.toHaveBeenCalled();
  });

  it('refuses to sign into a BLOCKED account and follows a MERGED account to its target', async () => {
    const blocked = user({ id: OWNER_ID, status: 'BLOCKED', type: 'REGISTERED' });
    const { service } = makeService({ identity: identityRow(blocked), current: null });
    await expect(
      service.signIn({ provider: 'GOOGLE', subject: 'google-sub-1' }, ctx()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const merged = user({ id: 'merged-guest', status: 'MERGED', mergedIntoId: OWNER_ID });
    const target = user({ id: OWNER_ID, type: 'REGISTERED' });
    const { service: s2, prisma } = makeService({ identity: identityRow(merged), current: null });
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id === OWNER_ID ? target : null),
    );
    const session = await s2.signIn({ provider: 'GOOGLE', subject: 'google-sub-1' }, ctx());
    expect(session.user.id).toBe(OWNER_ID);
  });
});

describe('IdentityAuthService e-mail', () => {
  it('register: hashes with Argon2id, stores the e-mail identity, 409 EMAIL_TAKEN when it exists', async () => {
    const { service, tx } = makeService({ identity: null, current: null });
    await service.registerEmail('Awa@Example.com', 'motdepasse-solide', ctx());
    const createArgs = tx.user.create.mock.calls[0]?.[0];
    expect(createArgs.data.identities).toEqual({
      create: { provider: 'EMAIL', subject: 'awa@example.com' },
    });
    const updateArgs = tx.user.update.mock.calls[0]?.[0] as { data: Record<string, string> };
    expect(updateArgs.data.email).toBe('awa@example.com');
    expect(updateArgs.data.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(updateArgs.data.passwordHash, 'motdepasse-solide')).resolves.toBe(
      true,
    );

    const owner = user({ id: OWNER_ID, type: 'REGISTERED', email: 'awa@example.com' });
    const taken = makeService({
      identity: { ...identityRow(owner), provider: 'EMAIL', subject: 'awa@example.com' },
      current: null,
    });
    await expect(
      taken.service.registerEmail('awa@example.com', 'motdepasse-solide', ctx()),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
    expect(ConflictException).toBeDefined();
  });

  it('login: INVALID_CREDENTIALS on unknown e-mail or wrong password, merges a guest on success', async () => {
    const hash = await argon2.hash('motdepasse-solide', { type: argon2.argon2id });
    const owner = user({
      id: OWNER_ID,
      type: 'REGISTERED',
      email: 'awa@example.com',
      passwordHash: hash,
    });
    const guest = user();
    const { service, merge } = makeService({
      identity: { ...identityRow(owner), provider: 'EMAIL', subject: 'awa@example.com' },
      current: guest,
    });

    await expect(
      service.loginEmail('awa@example.com', 'wrong-password', ctx(guest)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const none = makeService({ identity: null, current: null });
    await expect(
      none.service.loginEmail('nobody@example.com', 'motdepasse-solide', ctx()),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

    const session = await service.loginEmail(' AWA@example.com ', 'motdepasse-solide', ctx(guest));
    expect(merge.merge).toHaveBeenCalled();
    expect(session).toMatchObject({ user: { id: OWNER_ID }, linked: true });
    expect(normalizeEmail(' AWA@example.com ')).toBe('awa@example.com');
  });
});
