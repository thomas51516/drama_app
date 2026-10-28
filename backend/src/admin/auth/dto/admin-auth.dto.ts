import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { AdminRole } from '../../../generated/prisma/client.js';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@drama.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @Length(8, 200)
  password: string;
}

export class AdminTotpVerifyDto {
  @ApiProperty({ description: 'Jeton de défi renvoyé par /admin/auth/login (5 min).' })
  @IsString()
  @Length(20, 2048)
  challengeToken: string;

  @ApiProperty({
    description: 'Code TOTP à 6 chiffres (fenêtre ±1 pas de 30 s).',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class AdminUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'admin@drama.local' })
  email: string;

  @ApiProperty({ example: 'Administrateur' })
  displayName: string;

  @ApiProperty({ enum: Object.values(AdminRole) })
  role: AdminRole;
}

export const ADMIN_LOGIN_STATUSES = ['totp_required', 'totp_setup_required'] as const;
export type AdminLoginStatus = (typeof ADMIN_LOGIN_STATUSES)[number];

export class AdminLoginResponseDto {
  @ApiProperty({
    enum: ADMIN_LOGIN_STATUSES,
    description:
      '`totp_setup_required` à la première connexion : afficher le QR code (`otpauthUri`) puis appeler /totp/verify avec le premier code.',
  })
  status: AdminLoginStatus;

  @ApiProperty({
    description: 'À renvoyer tel quel à /admin/auth/totp/verify. Expire en 5 minutes.',
  })
  challengeToken: string;

  @ApiPropertyOptional({
    description: 'Secret TOTP base32 (uniquement si `totp_setup_required`).',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret?: string;

  @ApiPropertyOptional({
    description: 'URI otpauth:// à encoder en QR code (uniquement si `totp_setup_required`).',
    example:
      'otpauth://totp/DRAMA%20back-office%3Aadmin%40drama.local?secret=JBSWY3DPEHPK3PXP&issuer=DRAMA+back-office&algorithm=SHA1&digits=6&period=30',
  })
  otpauthUri?: string;
}

export class AdminSessionDto {
  @ApiProperty({
    description: 'JWT admin (`aud: admin`), à présenter dans `Authorization: Bearer`.',
  })
  accessToken: string;

  @ApiProperty({ description: 'Durée de vie en secondes.', example: 28800 })
  expiresIn: number;

  @ApiProperty({ type: AdminUserDto })
  user: AdminUserDto;
}
