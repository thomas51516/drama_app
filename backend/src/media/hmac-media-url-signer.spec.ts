import {
  computeMediaToken,
  HmacMediaUrlSigner,
  signedPathOf,
  verifyMediaUrl,
} from './hmac-media-url-signer.js';
import { PlainMediaUrlSigner } from './plain-media-url-signer.js';

const KEY = 'unit-test-media-signing-key-0123456789';
const MANIFEST = 'http://cdn.test/drama-media/hls/0192-ep/master.m3u8';
const NOW = new Date('2026-10-29T10:00:00Z');

describe('HmacMediaUrlSigner', () => {
  it('appends token and expires computed over the manifest directory', () => {
    const signer = new HmacMediaUrlSigner(KEY, 300);
    const signed = signer.sign(MANIFEST, NOW);
    const url = new URL(signed.url);
    const expires = Number(url.searchParams.get('expires'));
    expect(expires).toBe(Math.floor(NOW.getTime() / 1000) + 300);
    expect(signed.expiresAt).toBe(new Date(expires * 1000).toISOString());
    expect(url.pathname).toBe('/drama-media/hls/0192-ep/master.m3u8');
    expect(url.searchParams.get('token')).toBe(
      computeMediaToken(KEY, '/drama-media/hls/0192-ep/', expires),
    );
    expect(signedPathOf(url.pathname)).toBe('/drama-media/hls/0192-ep/');
  });

  it('verifies its own URLs and rejects tampering, another key or an expired token', () => {
    const signer = new HmacMediaUrlSigner(KEY, 60);
    const { url } = signer.sign(MANIFEST, NOW);
    expect(signer.verify(url, NOW)).toBe(true);
    // Un sous-manifeste du même dossier est couvert par le même jeton.
    const variant = url.replace('master.m3u8', '720p/index.m3u8');
    expect(verifyMediaUrl(KEY, variant.replace('/720p/index.m3u8', '/master.m3u8'), NOW)).toBe(
      true,
    );
    expect(verifyMediaUrl('another-key-0123456789abcdef', url, NOW)).toBe(false);
    expect(signer.verify(url.replace('0192-ep', '0192-other'), NOW)).toBe(false);
    expect(signer.verify(url, new Date(NOW.getTime() + 61_000))).toBe(false);
    expect(verifyMediaUrl(KEY, MANIFEST, NOW)).toBe(false);
  });

  it('refuses to start without a key', () => {
    expect(() => new HmacMediaUrlSigner('', 60)).toThrow();
  });
});

describe('PlainMediaUrlSigner', () => {
  it('returns the URL untouched with an expiry at now + TTL', () => {
    const signed = new PlainMediaUrlSigner(300).sign(MANIFEST, NOW);
    expect(signed.url).toBe(MANIFEST);
    expect(signed.expiresAt).toBe('2026-10-29T10:05:00.000Z');
  });
});
