import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';
import { type RequestWithContext } from '../request-context.js';

const QUIET_PATHS = new Set(['/health', '/health/live']);

/** Journalise chaque requête (méthode, chemin, statut, durée) et propage un x-request-id. */
export function requestLogger(logger = new Logger('HTTP')) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
    (req as RequestWithContext).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms [${requestId}]`;
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else if (QUIET_PATHS.has(req.path)) logger.debug(line);
      else logger.log(line);
    });

    next();
  };
}
