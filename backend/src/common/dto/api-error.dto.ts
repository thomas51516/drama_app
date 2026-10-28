import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Format unique de toutes les erreurs de l'API (voir AllExceptionsFilter). */
export class ApiErrorDto {
  @ApiProperty({ example: 403 })
  statusCode: number;

  @ApiProperty({
    description: 'Code stable destiné au client (à localiser côté app).',
    example: 'EPISODE_LOCKED',
  })
  code: string;

  @ApiProperty({ example: 'This episode must be unlocked first' })
  message: string;

  @ApiPropertyOptional({
    description: 'Détails complémentaires (erreurs de validation, coût en pièces, etc.).',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;

  @ApiProperty({ example: '/episodes/0192f1f0-8a5b-7c3d-9e1f-abcdefabcdef/play' })
  path: string;

  @ApiProperty({ example: '2026-10-28T10:00:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({ description: 'Identifiant de corrélation (en-tête x-request-id).' })
  requestId?: string;
}
