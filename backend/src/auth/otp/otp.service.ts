import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { RedisService } from '../../redis/redis.service.js';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms-provider.js';

/** Paramètres du contrat public v1.2 : code à 6 chiffres, 5 min, 5 essais, renvoi après 60 s. */
export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_AFTER_SECONDS = 60;

export interface OtpRequestResult {
  requestId: string;
  expiresIn: number;
  resendAfter: number;
}

interface StoredOtp {
  phone: string;
  codeHash: string;
  attempts: number;
}

export const otpRequestKey = (requestId: string): string => `otp:req:${requestId}`;
export const otpResendKey = (phone: string): string => `otp:resend:${phone}`;
/** Mode `console` uniquement : code en clair pour le dev et les tests. */
export const otpDevCodeKey = (requestId: string): string => `otp:${requestId}`;

/**
 * OTP SMS (S05-BE-02, M-51) : demandes stockées dans Redis (code haché, compteur d'essais, TTL),
 * envoi par le port `SmsProvider`. Un numéro ne peut redemander un code qu'après 60 s ; la limite
 * de 3 demandes par numéro et 15 min est portée par `@RateLimit({ scope: 'phone' })`.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async request(phone: string): Promise<OtpRequestResult> {
    const client = this.redis.client;
    const resendTtl = await client.ttl(otpResendKey(phone));
    if (resendTtl > 0) {
      throw new HttpException(
        {
          code: 'OTP_RESEND_TOO_SOON',
          message: `A code was sent recently, retry in ${resendTtl}s`,
          details: { retryAfterSeconds: resendTtl },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const requestId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const stored: StoredOtp = { phone, codeHash: this.hash(requestId, code), attempts: 0 };
    const multi = client
      .multi()
      .set(otpRequestKey(requestId), JSON.stringify(stored), 'EX', OTP_TTL_SECONDS)
      .set(otpResendKey(phone), '1', 'EX', OTP_RESEND_AFTER_SECONDS);
    if (this.sms.name === 'console') {
      multi.set(otpDevCodeKey(requestId), code, 'EX', OTP_TTL_SECONDS);
    }
    await multi.exec();

    await this.sms.send(phone, `DRAMA : votre code de connexion est ${code} (valable 5 min).`);
    this.logger.log(`OTP requested for ${maskPhone(phone)} (request ${requestId})`);
    return {
      requestId,
      expiresIn: OTP_TTL_SECONDS,
      resendAfter: OTP_RESEND_AFTER_SECONDS,
    };
  }

  /** Vérifie le code ; renvoie le numéro validé. La demande est consommée en cas de succès. */
  async verify(requestId: string, code: string): Promise<string> {
    const client = this.redis.client;
    const key = otpRequestKey(requestId);
    const raw = await client.get(key);
    if (!raw) {
      throw new NotFoundException({
        code: 'OTP_REQUEST_NOT_FOUND',
        message: 'Unknown or expired OTP request, ask for a new code',
      });
    }
    const stored = JSON.parse(raw) as StoredOtp;
    if (stored.attempts >= OTP_MAX_ATTEMPTS) {
      await client.del(key, otpDevCodeKey(requestId));
      throw new GoneException({
        code: 'OTP_TOO_MANY_ATTEMPTS',
        message: 'Too many wrong codes, ask for a new one',
      });
    }

    const expected = Buffer.from(stored.codeHash, 'hex');
    const actual = Buffer.from(this.hash(requestId, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      stored.attempts += 1;
      const ttl = await client.ttl(key);
      if (stored.attempts >= OTP_MAX_ATTEMPTS) {
        await client.del(key, otpDevCodeKey(requestId));
        throw new GoneException({
          code: 'OTP_TOO_MANY_ATTEMPTS',
          message: 'Too many wrong codes, ask for a new one',
        });
      }
      await client.set(key, JSON.stringify(stored), 'EX', Math.max(ttl, 1));
      throw new UnauthorizedException({
        code: 'OTP_INVALID_CODE',
        message: 'Wrong code',
        details: { attemptsLeft: OTP_MAX_ATTEMPTS - stored.attempts },
      });
    }

    await client.del(key, otpDevCodeKey(requestId));
    return stored.phone;
  }

  private hash(requestId: string, code: string): string {
    return createHmac('sha256', this.config.refreshTokenSecret)
      .update(`${requestId}:${code}`)
      .digest('hex');
  }
}

export function maskPhone(phone: string): string {
  return phone.length <= 4 ? '****' : `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}
