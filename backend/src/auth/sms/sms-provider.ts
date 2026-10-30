export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Port d'envoi de SMS (OTP, S05-BE-02) : `console` en dev, `http` générique en production. */
export interface SmsProvider {
  readonly name: 'console' | 'http';
  send(to: string, text: string): Promise<void>;
}
