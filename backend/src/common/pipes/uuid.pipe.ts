import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';

/**
 * `ParseUUIDPipe` aligné sur le format d'erreur de l'API (DEF-009) : un identifiant mal formé
 * répond `400 VALIDATION_ERROR` comme les autres erreurs de validation, et non `BAD_REQUEST`.
 */
@Injectable()
export class UuidPipe extends ParseUUIDPipe {
  constructor() {
    super({
      exceptionFactory: () =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { errors: ['id must be a UUID'] },
        }),
    });
  }
}
