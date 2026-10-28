import { NotImplementedException } from '@nestjs/common';

/** Réponse 501 normalisée pour les endpoints planifiés dans un sprint ultérieur. */
export function notImplemented(ticket: string): never {
  throw new NotImplementedException({
    code: 'NOT_IMPLEMENTED',
    message: `Not implemented yet (planned in ${ticket})`,
  });
}
