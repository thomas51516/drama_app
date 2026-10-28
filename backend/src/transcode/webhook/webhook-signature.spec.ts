import { transcodeJobId } from '../providers/local-transcode.provider.js';
import { signWebhook, verifyWebhookSignature } from './webhook-signature.js';

describe('transcodeJobId', () => {
  it('never contains ":" (rejected by BullMQ custom ids) and stays unique per submission', () => {
    const id = transcodeJobId('0192f1f0-8a5b-7c3d-9e1f-0000000000e1', 1_700_000_000_000);
    expect(id).toBe('0192f1f0-8a5b-7c3d-9e1f-0000000000e1-1700000000000');
    expect(id).not.toContain(':');
  });
});

const secret = 'unit-test-webhook-secret-0123456789';
const body = Buffer.from('{"event":"completed","episodeId":"x"}');

describe('webhook signature', () => {
  it('verifies a valid signature and rejects tampering or a wrong secret', () => {
    const sig = signWebhook(secret, body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, body, sig, undefined)).toBe(true);
    expect(verifyWebhookSignature(secret, Buffer.from('{"event":"failed"}'), sig, undefined)).toBe(
      false,
    );
    expect(verifyWebhookSignature('other-secret-0123456789abcdef', body, sig, undefined)).toBe(
      false,
    );
    expect(verifyWebhookSignature(secret, body, undefined, undefined)).toBe(false);
    expect(verifyWebhookSignature(secret, body, 'sha256=00', undefined)).toBe(false);
  });

  it('binds the signature to the timestamp and rejects stale ones (±5 min)', () => {
    const now = 1_800_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const sig = signWebhook(secret, body, ts);
    expect(verifyWebhookSignature(secret, body, sig, ts, now)).toBe(true);
    expect(verifyWebhookSignature(secret, body, sig, undefined, now)).toBe(false);
    expect(verifyWebhookSignature(secret, body, sig, ts, now + 10 * 60_000)).toBe(false);
  });
});
