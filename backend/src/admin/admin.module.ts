import { Module } from '@nestjs/common';
import { AdminAccountsModule } from './accounts/admin-accounts.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AdminAuthModule } from './auth/admin-auth.module.js';
import { AdminEpisodesModule } from './episodes/admin-episodes.module.js';
import { AdminHomeModule } from './home/admin-home.module.js';
import { AdminSeriesModule } from './series/admin-series.module.js';
import { AdminSubtitlesModule } from './subtitles/admin-subtitles.module.js';

/**
 * Back-office (§5, §8.2) : endpoints /admin/* réservés aux comptes internes, contrôlés par rôle
 * (EDITOR, MONETIZATION, SUPPORT, ADMIN) et tracés dans `audit_logs`.
 * Livré : séries (B-01), épisodes (B-02), sous-titres (B-03), mise en avant (B-05), comptes et audit (B-13).
 * TODO S06+ utilisateurs (B-09), monétisation (B-06), tableaux de bord (B-11).
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
  ],
})
export class AdminModule {}
