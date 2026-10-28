import { ApiProperty } from '@nestjs/swagger';
import { UserStatus, UserType } from '../../generated/prisma/client.js';

export class AuthTokensDto {
  @ApiProperty({ enum: ['Bearer'] })
  tokenType: 'Bearer';

  @ApiProperty({ description: 'JWT à présenter dans `Authorization: Bearer <token>`.' })
  accessToken: string;

  @ApiProperty({ description: "Durée de vie du JWT d'accès en secondes.", example: 900 })
  accessTokenExpiresIn: number;

  @ApiProperty({
    description:
      'Jeton opaque à usage unique : chaque appel à /auth/refresh en émet un nouveau et révoque le précédent. À stocker de façon sécurisée (EncryptedSharedPreferences).',
  })
  refreshToken: string;

  @ApiProperty({ example: '2026-11-27T10:00:00.000Z' })
  refreshTokenExpiresAt: string;
}

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: Object.values(UserType) })
  type: UserType;

  @ApiProperty({ enum: Object.values(UserStatus) })
  status: UserStatus;

  @ApiProperty({ example: 'fr' })
  language: string;

  @ApiProperty({ type: String, nullable: true, example: 'TG' })
  country: string | null;

  @ApiProperty()
  isVip: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  vipExpiresAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  @ApiProperty({ type: AuthTokensDto })
  tokens: AuthTokensDto;
}
