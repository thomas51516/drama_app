import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StatsOverviewQueryDto {
  @ApiPropertyOptional({
    default: 7,
    minimum: 1,
    maximum: 90,
    description: 'Fenêtre en jours pour nouveaux utilisateurs, épisodes et top séries',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days: number = 7;
}

export class ActiveUsersDto {
  @ApiProperty({ description: 'Actifs sur 24 h', example: 42 })
  d1: number;

  @ApiProperty({ description: 'Actifs sur 7 jours', example: 180 })
  d7: number;

  @ApiProperty({ description: 'Actifs sur 30 jours', example: 530 })
  d30: number;
}

export class TopSeriesStatDto {
  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty({ example: 'Le Secret du Lagon' })
  title: string;

  @ApiProperty({ description: 'Spectateurs distincts sur la fenêtre', example: 120 })
  viewers: number;

  @ApiProperty({ description: 'Épisodes terminés sur la fenêtre', example: 310 })
  completions: number;
}

export class StatsOverviewDto {
  @ApiProperty({ type: ActiveUsersDto })
  activeUsers: ActiveUsersDto;

  @ApiProperty({ description: 'Comptes créés sur la fenêtre', example: 25 })
  newUsers: number;

  @ApiProperty({ description: 'Comptes inscrits (Google, téléphone, e-mail), total', example: 300 })
  registeredUsers: number;

  @ApiProperty({ description: 'Comptes invités, total', example: 1200 })
  guestUsers: number;

  @ApiProperty({ description: 'Épisodes commencés sur la fenêtre (utilisateur × épisode)' })
  episodesStarted: number;

  @ApiProperty({ description: 'Épisodes terminés sur la fenêtre' })
  episodesCompleted: number;

  @ApiProperty({ type: [TopSeriesStatDto], description: '10 séries les plus regardées' })
  topSeries: TopSeriesStatDto[];

  @ApiProperty({ description: 'Affichages du paywall sur la fenêtre (événement `paywall_view`)' })
  paywallViews: number;

  @ApiProperty({
    description: 'Déblocages sur la fenêtre (0 tant que la monétisation n’est pas livrée)',
  })
  unlocks: number;

  @ApiProperty({ description: 'Ouvertures de notification sur la fenêtre (événement `push_open`)' })
  pushOpens: number;

  @ApiProperty({ description: 'Fenêtre utilisée, en jours', example: 7 })
  days: number;

  @ApiProperty({ format: 'date-time', description: 'Calcul (mis en cache 5 min)' })
  generatedAt: string;
}
