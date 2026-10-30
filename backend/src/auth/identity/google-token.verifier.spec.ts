import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { type Env } from '../../config/env.schema.js';

const verifyIdToken = vi.fn();
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const { GoogleTokenVerifier } = await import('./google-token.verifier.js');

const WEB_ID = '707428524631-example.apps.googleusercontent.com';
const ANDROID_ID = '707428524631-android.apps.googleusercontent.com';

function makeVerifier(ids: string) {
  return new GoogleTokenVerifier(new AppConfig({ GOOGLE_CLIENT_IDS: ids } as unknown as Env));
}

describe('GoogleTokenVerifier', () => {
  beforeEach(() => verifyIdToken.mockReset());

  it('is disabled without GOOGLE_CLIENT_IDS (503 GOOGLE_AUTH_DISABLED, no network call)', async () => {
    const verifier = makeVerifier('');
    expect(verifier.enabled).toBe(false);
    await expect(verifier.verify('x'.repeat(40))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(verifier.verify('x'.repeat(40))).rejects.toMatchObject({
      response: { code: 'GOOGLE_AUTH_DISABLED' },
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('verifies against every configured audience and maps the payload', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-42',
        email: 'awa@example.com',
        email_verified: true,
        name: 'Awa K.',
      }),
    });
    const verifier = makeVerifier(` ${WEB_ID}, ${ANDROID_ID} `);
    expect(verifier.enabled).toBe(true);
    await expect(verifier.verify('id-token-value-0123456789abcdef')).resolves.toEqual({
      sub: 'google-sub-42',
      email: 'awa@example.com',
      emailVerified: true,
      name: 'Awa K.',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token-value-0123456789abcdef',
      audience: [WEB_ID, ANDROID_ID],
    });
  });

  it('rejects an invalid, expired or foreign-audience token with 401 GOOGLE_TOKEN_INVALID', async () => {
    verifyIdToken.mockRejectedValue(
      new Error('Wrong recipient, payload audience != requiredAudience'),
    );
    const verifier = makeVerifier(WEB_ID);
    await expect(verifier.verify('bad-token-value-0123456789abcdef')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    verifyIdToken.mockResolvedValue({ getPayload: () => undefined });
    await expect(verifier.verify('bad-token-value-0123456789abcdef')).rejects.toMatchObject({
      response: { code: 'GOOGLE_TOKEN_INVALID' },
    });
  });
});
