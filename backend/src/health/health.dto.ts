import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ComponentHealthDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status: 'up' | 'down';

  @ApiProperty({ example: 2.3 })
  latencyMs: number;

  @ApiPropertyOptional({ example: 'connect ECONNREFUSED 127.0.0.1:6379' })
  error?: string;
}

export class HealthChecksDto {
  @ApiProperty({ type: ComponentHealthDto })
  database: ComponentHealthDto;

  @ApiProperty({ type: ComponentHealthDto })
  redis: ComponentHealthDto;
}

export class HealthReportDto {
  @ApiProperty({ enum: ['ok', 'degraded'], description: '`degraded` => HTTP 503' })
  status: 'ok' | 'degraded';

  @ApiProperty({ example: '2026-10-28T10:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 1234 })
  uptimeSeconds: number;

  @ApiProperty({ type: HealthChecksDto })
  checks: HealthChecksDto;
}

export class LivenessDto {
  @ApiProperty({ enum: ['ok'] })
  status: 'ok';

  @ApiProperty()
  timestamp: string;

  @ApiProperty()
  uptimeSeconds: number;
}
