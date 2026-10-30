import { generateKeyPairSync, sign } from 'node:crypto';
import { buildSsvQuery, parseSsvQuery } from './ad-ssv-verifier.js';
import { AdmobAdSsvVerifier } from './admob-ad-ssv.verifier.js';
import { FakeAdSsvVerifier, signFakeSsv } from './fake-ad-ssv.verifier.js';

const params = {
  ad_network: '5450213213286189855',
  ad_unit: '1234567890',
  custom_data: 'session-1:nonce',
  reward_amount: 1,
  reward_item: 'episode',
  timestamp: '1761825600000',
  transaction_id: 'tx-abc',
  user_id: 'user-1',
};

describe('SSV query parsing', () => {
  it('signs everything before &signature= and reads the AdMob parameters', () => {
    const content = buildSsvQuery(params);
    const parsed = parseSsvQuery(`${content}&signature=SIG&key_id=42`);
    expect(parsed.content).toBe(content);
    expect(parsed.params).toMatchObject({
      customData: 'session-1:nonce',
      transactionId: 'tx-abc',
      userId: 'user-1',
      signature: 'SIG',
      keyId: '42',
      rewardAmount: '1',
    });
    expect(parseSsvQuery(`?${content}&signature=SIG`).content).toBe(content);
  });
});

describe('FakeAdSsvVerifier (AD_PROVIDER=fake)', () => {
  it('accepts an HMAC-SHA256 signature of the content and rejects a tampered query', async () => {
    const verifier = new FakeAdSsvVerifier('secret-0123456789abcdef');
    const content = buildSsvQuery(params);
    const signature = signFakeSsv('secret-0123456789abcdef', content);
    await expect(verifier.verify(content, signature, null)).resolves.toBe(true);
    await expect(
      verifier.verify(content.replace('user-1', 'user-2'), signature, null),
    ).resolves.toBe(false);
    await expect(verifier.verify(content, 'bad', null)).resolves.toBe(false);
  });
});

describe('AdmobAdSsvVerifier (ECDSA P-256)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const base64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const content = buildSsvQuery(params);
  const signature = sign('sha256', Buffer.from(content), {
    key: privateKey,
    dsaEncoding: 'der',
  }).toString('base64url');

  it('verifies a signature with the key designated by key_id, loaded from the keys document', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ keys: [{ keyId: 42, base64 }] }),
      }),
    );
    const verifier = new AdmobAdSsvVerifier('https://keys.example/verifier-keys.json', fetchImpl);
    await expect(verifier.verify(content, signature, '42')).resolves.toBe(true);
    await expect(verifier.verify(`${content}x`, signature, '42')).resolves.toBe(false);
    await expect(verifier.verify(content, signature, null)).resolves.toBe(false);
    // Clé en cache : un second appel ne recharge pas.
    await verifier.verify(content, signature, '42');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reloads the keys once for an unknown key_id and after 24 h', async () => {
    let clock = 1_000_000;
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ keys: [{ keyId: '7', pem }] }),
      }),
    );
    const verifier = new AdmobAdSsvVerifier('https://keys.example', fetchImpl, () => clock);
    verifier.setKeys([], clock);
    await expect(verifier.verify(content, signature, '7')).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(verifier.verify(content, signature, '8')).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    clock += 25 * 3_600_000;
    await verifier.verify(content, signature, '7');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails closed when the keys document is unreachable', async () => {
    const verifier = new AdmobAdSsvVerifier('https://keys.example', () =>
      Promise.reject(new Error('offline')),
    );
    await expect(verifier.verify(content, signature, '42')).resolves.toBe(false);
  });
});
