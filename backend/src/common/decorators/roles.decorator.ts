import { SetMetadata } from '@nestjs/common';
import { type AdminRole } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'adminRoles';

/** Rôles internes autorisés sur une route admin (B-13). Sans décorateur : tout compte actif. */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
