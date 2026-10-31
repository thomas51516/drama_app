import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminRightsService } from './admin-rights.service.js';
import { type RightsContract, type Series } from '../../generated/prisma/client.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';

const admin: AuthenticatedAdmin = {
  id: 'adm',
  email: 'admin@drama.local',
  displayName: 'Admin',
  role: 'ADMIN',
  jti: 'j',
  exp: 0,
};

function contract(partial: Partial<RightsContract> = {}): RightsContract {
  return {
    id: 'c1',
    seriesId: 's1',
    rightsHolder: 'Le client',
    territories: [],
    licenseStartsAt: new Date('2026-01-01T00:00:00Z'),
    licenseEndsAt: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...partial,
  };
}

function makeService(opts: {
  series?: Pick<Series, 'id'> | null;
  existingContract?: RightsContract | null;
  allSeries?: Array<{
    id: string;
    title: string;
    status: string;
    rightsContract: RightsContract | null;
  }>;
}) {
  const tx = {
    rightsContract: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(contract(data as Partial<RightsContract>)),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(contract({ ...(opts.existingContract ?? {}), ...data })),
      ),
      delete: vi.fn(() => Promise.resolve(opts.existingContract ?? contract())),
    },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    series: {
      findUnique: vi.fn(() =>
        Promise.resolve(opts.series === undefined ? { id: 's1' } : opts.series),
      ),
      findMany: vi.fn(() => Promise.resolve(opts.allSeries ?? [])),
    },
    rightsContract: {
      findUnique: vi.fn(() => Promise.resolve(opts.existingContract ?? null)),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new AdminRightsService(prisma as never, audit as never);
  return { service, prisma, tx, audit };
}

describe('AdminRightsService', () => {
  it('404s when the series does not exist', async () => {
    const { service } = makeService({ series: null });
    await expect(service.getForSeries('s1')).rejects.toMatchObject({
      response: { code: 'SERIES_NOT_FOUND' },
    });
  });

  it('404s when no contract is registered yet', async () => {
    const { service } = makeService({ existingContract: null });
    await expect(service.getForSeries('s1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the contract when it exists', async () => {
    const { service } = makeService({ existingContract: contract() });
    const dto = await service.getForSeries('s1');
    expect(dto).toMatchObject({ rightsHolder: 'Le client', seriesId: 's1' });
  });

  it('create() refuses a second contract for the same series (409)', async () => {
    const { service } = makeService({ existingContract: contract() });
    await expect(
      service.create('s1', { rightsHolder: 'X', licenseStartsAt: '2026-01-01T00:00:00Z' }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create() inserts a contract and audits it', async () => {
    const { service, audit } = makeService({ existingContract: null });
    const dto = await service.create(
      's1',
      { rightsHolder: 'Le client', licenseStartsAt: '2026-10-31T00:00:00Z' },
      admin,
      '1.2.3.4',
    );
    expect(dto.rightsHolder).toBe('Le client');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rights_contract.create', targetType: 'rights_contract' }),
      expect.anything(),
    );
  });

  it('update() 404s when no contract exists', async () => {
    const { service } = makeService({ existingContract: null });
    await expect(service.update('s1', { rightsHolder: 'Y' }, admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update() changes only the provided fields and audits the diff', async () => {
    const { service, audit } = makeService({ existingContract: contract() });
    const updated = await service.update('s1', { rightsHolder: 'Nouveau' }, admin);
    expect(updated.rightsHolder).toBe('Nouveau');
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      action: 'rights_contract.update',
      oldValue: { rightsHolder: 'Le client' },
      newValue: { rightsHolder: 'Nouveau' },
    });
  });

  it('remove() deletes and audits, 404s when absent', async () => {
    const { service, tx } = makeService({ existingContract: contract() });
    await service.remove('s1', admin);
    expect(tx.rightsContract.delete).toHaveBeenCalledWith({ where: { seriesId: 's1' } });

    const { service: service2 } = makeService({ existingContract: null });
    await expect(service2.remove('s1', admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('list()', () => {
    const now = new Date('2026-10-31T00:00:00Z');

    it('computes rightsStatus per series and returns everything without a filter', async () => {
      const { service } = makeService({
        allSeries: [
          { id: 's1', title: 'La Nounou', status: 'PUBLISHED', rightsContract: null },
          {
            id: 's2',
            title: 'Le Secret du Lagon',
            status: 'DRAFT',
            rightsContract: contract({
              seriesId: 's2',
              licenseEndsAt: new Date('2026-11-05T00:00:00Z'),
            }),
          },
        ],
      });
      const result = await service.list({}, now);
      expect(result.total).toBe(2);
      expect(result.items.find((i) => i.seriesId === 's1')?.rightsStatus).toBe('NONE');
      expect(result.items.find((i) => i.seriesId === 's2')?.rightsStatus).toBe('ACTIVE');
    });

    it('expiringWithinDays keeps NONE/EXPIRED and ACTIVE contracts ending inside the window', async () => {
      const { service } = makeService({
        allSeries: [
          { id: 's1', title: 'La Nounou', status: 'PUBLISHED', rightsContract: null },
          {
            id: 's2',
            title: 'Bientôt fini',
            status: 'PUBLISHED',
            rightsContract: contract({
              seriesId: 's2',
              licenseEndsAt: new Date('2026-11-05T00:00:00Z'),
            }),
          },
          {
            id: 's3',
            title: 'Longue licence',
            status: 'PUBLISHED',
            rightsContract: contract({
              seriesId: 's3',
              licenseEndsAt: new Date('2030-01-01T00:00:00Z'),
            }),
          },
        ],
      });
      const result = await service.list({ expiringWithinDays: 10 }, now);
      expect(result.items.map((i) => i.seriesId).sort()).toEqual(['s1', 's2']);
    });
  });
});
