import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AdminAuthModule } from './auth/admin-auth.module.js';
import { AdminEpisodesModule } from './episodes/admin-episodes.module.js';
import { AdminSeriesModule } from './series/admin-series.module.js';

/**
 * Back-office (§5, §8.2) : endpoints /admin/* réservés aux comptes internes, contrôlés par rôle
 * (EDITOR, MONETIZATION, SUPPORT, ADMIN) et tracés dans `audit_logs`.
 * TODO S03-BE-03 sous-titres — TODO S04 mise en avant (B-05) — TODO S06+ utilisateurs, monétisation, tableaux de bord.
 */
@Module({ imports: [AuditModule, AdminAuthModule, AdminSeriesModule, AdminEpisodesModule] })
export class AdminModule {}
