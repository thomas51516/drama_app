import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { AppConfig } from '../config/app-config.js';
import { MetricsService } from './metrics.service.js';

/**
 * `GET /metrics` (Prometheus). Endpoint interne : à ne pas exposer publiquement par le reverse proxy ;
 * si `METRICS_TOKEN` est défini, exige `Authorization: Bearer <token>`.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  async scrape(@Res() res: Response, @Headers('authorization') authorization?: string) {
    const { enabled, token } = this.config.metrics;
    if (!enabled) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Metrics disabled' });
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Metrics token required',
      });
    }
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.render());
  }
}
