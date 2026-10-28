import { base32Encode, hotp, otpauthUri, totpCode, verifyTotp } from './totp.js';
import { SecretBox } from './secret-box.js';

// Vecteurs RFC 6238 (annexe B), secret ASCII "12345678901234567890", SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 test vectors (last 6 digits of the 8-digit codes)', () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ];
    for (const [seconds, expected8] of vectors) {
      expect(hotp(RFC_SECRET, BigInt(Math.floor(seconds / 30)), 8)).toBe(expected8);
      expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(expected8.slice(-6));
    }
  });

  it('accepts the previous and next step only (window ±1)', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now), { atMs: now })).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now, -1), { atMs: now })).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now, 1), { atMs: now })).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now, 2), { atMs: now })).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345', { atMs: now })).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', { atMs: now })).toBe(false);
  });

  it('builds a standard otpauth URI', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'admin@drama.local', 'DRAMA back-office');
    expect(uri.startsWith('otpauth://totp/DRAMA%20back-office%3Aadmin%40drama.local?')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=DRAMA+back-office');
    expect(uri).toContain('digits=6');
  });
});

describe('SecretBox', () => {
  it('round-trips and never stores the secret in clear', () => {
    const box = new SecretBox('unit-test-passphrase-0123456789abcdef');
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => new SecretBox('another-key-0123456789abcdef0123').open(sealed)).toThrow();
  });
});
