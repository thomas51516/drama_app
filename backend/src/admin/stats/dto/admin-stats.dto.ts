import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

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

export class RevenueBySourceDto {
  @ApiProperty({ enum: ['GOOGLE_PLAY', 'MOBILE_MONEY'], example: 'MOBILE_MONEY' })
  source: 'GOOGLE_PLAY' | 'MOBILE_MONEY';

  @ApiProperty({ example: 'XOF', description: 'ISO 4217' })
  currency: string;

  @ApiProperty({
    example: 150_000,
    description: 'Unité mineure de la devise (centimes ; FCFA sans décimale)',
  })
  amountMinor: number;

  @ApiProperty({ description: 'Nombre de paiements (lignes `purchases`) agrégés', example: 12 })
  orderCount: number;
}

export class PaywallConversionDto {
  @ApiProperty({
    description: 'Utilisateurs distincts ayant vu le paywall (`paywall_view`) sur la fenêtre',
  })
  paywallViewers: number;

  @ApiProperty({
    description:
      'Parmi eux, ceux ayant débloqué un épisode (toute méthode) dans les `windowHours` heures suivant une vue',
  })
  convertedViewers: number;

  @ApiProperty({ description: 'convertedViewers / paywallViewers, 0 si aucune vue', example: 0.34 })
  conversionRate: number;

  @ApiProperty({
    description:
      "Fenêtre d'attribution utilisée (approximation : pas de session partagée entre `analytics_events` et `unlocks`, donc un déblocage dans les N h qui suivent une vue est compté comme une conversion, même hors session)",
    example: 24,
  })
  windowHours: number;
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
    description: 'Déblocages sur la fenêtre, toute méthode (`unlocks.created_at`)',
  })
  unlocks: number;

  @ApiProperty({ description: 'Ouvertures de notification sur la fenêtre (événement `push_open`)' })
  pushOpens: number;

  @ApiProperty({
    type: [RevenueBySourceDto],
    description:
      "Revenus réels (hors codes promo) sur la fenêtre, par source et par devise (B-11). Calculé depuis `coin_ledger` (type PURCHASE) joint à `purchases`, jamais depuis la projection `wallets`. Les achats Google Play vérifiés par `BILLING_VERIFIER=fake` (environnement de développement) n'ont pas de montant réel (`amountMinor` toujours `null`) : seule l'intégration `google` en production renseigne le prix, donc `GOOGLE_PLAY` peut apparaître vide en dev même avec des achats crédités.",
  })
  revenueBySource: RevenueBySourceDto[];

  @ApiProperty({
    type: PaywallConversionDto,
    description: 'Conversion du paywall sur la fenêtre (B-11)',
  })
  paywallConversion: PaywallConversionDto;

  @ApiProperty({ description: 'Fenêtre utilisée, en jours', example: 7 })
  days: number;

  @ApiProperty({ format: 'date-time', description: 'Calcul (mis en cache 5 min)' })
  generatedAt: string;
}

export class RetentionQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Série unique ; absent = toute la catalogue (cohortes combinées série par série)',
  })
  @IsOptional()
  @IsUUID()
  seriesId?: string;
}

export class RetentionPointDto {
  @ApiProperty({ example: 1 })
  episodeNumber: number;

  @ApiProperty({
    description: 'Spectateurs distincts (utilisateur × série) ayant atteint cet épisode',
    example: 120,
  })
  viewers: number;

  @ApiProperty({
    description: 'viewers / cohortSize * 100, 100 pour l’épisode 1 par construction',
    example: 64.2,
  })
  retentionPercent: number;
}

export class RetentionStatsDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  seriesId: string | null;

  @ApiProperty({
    description:
      "Taille de la cohorte (spectateurs distincts de l'épisode 1 ; pour « toute la catalogue », somme des cohortes par série : un utilisateur qui a commencé l'épisode 1 de deux séries compte deux fois)",
    example: 340,
  })
  cohortSize: number;

  @ApiProperty({ type: [RetentionPointDto] })
  points: RetentionPointDto[];

  @ApiProperty({ format: 'date-time' })
  generatedAt: string;
}
