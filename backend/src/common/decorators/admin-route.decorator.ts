import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_ROUTE_KEY = 'isAdminRoute';

/**
 * Marque une route du back-office : la garde JWT utilisateur la laisse passer et
 * `AdminAuthGuard` (appliquée au contrôleur) exige un JWT admin.
 */
export const AdminRoute = () => SetMetadata(IS_ADMIN_ROUTE_KEY, true);
