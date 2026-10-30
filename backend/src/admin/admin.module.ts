import { Module } from '@nestjs/common';
import { AdminAccountsModule } from './accounts/admin-accounts.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AdminAuthModule } from './auth/admin-auth.module.js';
import { AdminEpisodesModule } from './episodes/admin-episodes.module.js';
import { AdminHomeModule } from './home/admin-home.module.js';
import { AdminScheduleModule } from './schedule/admin-schedule.module.js';
import { AdminSeriesModule } from './series/admin-series.module.js';
import { AdminStatsModule } from './stats/admin-stats.module.js';
import { AdminSubtitlesModule } from './subtitles/admin-subtitles.module.js';

/**
 * Back-office (§5, §8.2) : endpoints /admin/* réservés aux comptes internes, contrôlés par rôle
 * (EDITOR, MONETIZATION, SUPPORT, ADMIN) et tracés dans `audit_logs`.
 * Livré : séries (B-01), épisodes (B-02), sous-titres (B-03), publication programmée (B-04), mise en
 * avant (B-05), tableau de bord v0 (B-11), comptes et audit (B-13).
 * TODO S06+ utilisateurs (B-09), monétisation (B-06).
 */
@Module({
  imports: [
    AuditModule,
    AdminAuthModule,
    AdminSeriesModule,
    AdminEpisodesModule,
    AdminSubtitlesModule,
    AdminHomeModule,
    AdminAccountsModule,
    AdminScheduleModule,
    AdminStatsModule,
  ],
})
export class AdminModule {}
