import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { RedisService } from '../../redis/redis.service.js';
import { RATE_LIMIT_KEY, type RateLimitRule } from './rate-limit.decorator.js';

/**
 * Garde globale : applique les règles `@RateLimit()` d'une route via INCR/PEXPIRE Redis.
 * Si Redis est indisponible la requête passe (fail-open) et un avertissement est journalisé :
 * la disponibilité de l'authentification prime sur la limitation en dev/staging.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.rateLimitEnabled) return true;
    const rules = this.reflector.getAllAndOverride<RateLimitRule[] | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rules || rules.length === 0) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    for (const rule of rules) {
      const subject = this.subjectFor(rule, req);
      if (!subject) continue;
      const key = `rl:${rule.name}:${rule.scope}:${subject}`;
      let count: number;
      let ttlMs: number;
      try {
        const results = await this.redis.client.multi().incr(key).pttl(key).exec();
        count = Number(results?.[0]?.[1] ?? 0);
        ttlMs = Number(results?.[1]?.[1] ?? -1);
        if (ttlMs < 0) {
          ttlMs = rule.windowSeconds * 1000;
          await this.redis.client.pexpire(key, ttlMs);
        }
      } catch (err) {
        this.logger.warn(`Rate limit skipped (Redis unavailable): ${(err as Error).message}`);
        return true;
      }

      const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      res.setHeader('X-RateLimit-Limit', String(rule.limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, rule.limit - count)));
      if (count > rule.limit) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            message: `Too many requests, retry in ${retryAfterSeconds}s`,
            details: { rule: rule.name, limit: rule.limit, retryAfterSeconds },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }

  private subjectFor(rule: RateLimitRule, req: Request): string | undefined {
    if (rule.scope === 'ip') return req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const email = (req.body as Record<string, unknown> | undefined)?.email;
    return typeof email === 'string' && email.length > 0 ? email.trim().toLowerCase() : undefined;
  }
}
