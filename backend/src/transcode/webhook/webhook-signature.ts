import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-transcode-signature';
export const TIMESTAMP_HEADER = 'x-transcode-timestamp';
const MAX_SKEW_SECONDS = 300;

/** `sha256=<hex>` de HMAC-SHA256(secret, [timestamp + "."] + corps brut). */
export function signWebhook(secret: string, rawBody: Buffer | string, timestamp?: string): string {
  const payload = timestamp
    ? Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(rawBody)])
    : Buffer.from(rawBody);
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer | string,
  signature: string | undefined,
  timestamp: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!signature) return false;
  if (timestamp !== undefined) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > MAX_SKEW_SECONDS) return false;
  }
  const expected = Buffer.from(signWebhook(secret, rawBody, timestamp));
  const given = Buffer.from(signature.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}
