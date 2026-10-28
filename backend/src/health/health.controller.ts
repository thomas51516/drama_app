import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { HealthReportDto, LivenessDto } from './health.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'État de santé (readiness)',
    description: 'Vérifie PostgreSQL et Redis. Renvoie 503 si un composant est indisponible.',
  })
  @ApiOkResponse({ type: HealthReportDto })
  @ApiServiceUnavailableResponse({ type: HealthReportDto })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReportDto> {
    const report = await this.health.check();
    res.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Vivacité du processus (liveness), sans dépendance externe' })
  @ApiOkResponse({ type: LivenessDto })
  live(): LivenessDto {
    return this.health.liveness();
  }
}
