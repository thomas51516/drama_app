import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Route accessible sans jeton. Si un jeton valide est tout de même fourni,
 * `req.user` est renseigné (utile pour personnaliser /home).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
