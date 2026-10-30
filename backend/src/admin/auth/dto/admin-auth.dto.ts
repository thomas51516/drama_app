import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';
import { AdminRole } from '../../../generated/prisma/client.js';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@drama.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @Length(8, 200)
  password: string;

  @ApiPropertyOptional({
    description:
      "Jeton d'appareil de confiance (cookie `drama_admin_device`). S'il est valide pour ce compte et que la 2FA est enrôlée, la session est ouverte sans TOTP (`status: ok`). Un jeton invalide est ignoré.",
  })
  @IsOptional()
  @IsString()
  @Length(16, 512)
  deviceToken?: string;
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

  @ApiPropertyOptional({
    description:
      'Se souvenir de cet appareil (30 jours) : la réponse ajoute `deviceToken` et `deviceTokenExpiresAt`.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;
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

export const ADMIN_LOGIN_STATUSES = ['ok', 'totp_required', 'totp_setup_required'] as const;
export type AdminLoginStatus = (typeof ADMIN_LOGIN_STATUSES)[number];

export class AdminLoginResponseDto {
  @ApiProperty({
    enum: ADMIN_LOGIN_STATUSES,
    description:
      '`totp_setup_required` à la première connexion : afficher le QR code (`otpauthUri`) puis appeler /totp/verify avec le premier code. `ok` : appareil de confiance reconnu, la session est ouverte directement (`accessToken`, `expiresIn`, `user`).',
  })
  status: AdminLoginStatus;

  @ApiPropertyOptional({
    description:
      'À renvoyer tel quel à /admin/auth/totp/verify. Expire en 5 minutes. Absent si `status: ok`.',
  })
  challengeToken?: string;

  @ApiPropertyOptional({ description: 'JWT admin (uniquement si `status: ok`).' })
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Durée de vie en secondes (uniquement si `status: ok`).' })
  expiresIn?: number;

  @ApiPropertyOptional({ type: () => AdminUserDto, description: 'Uniquement si `status: ok`.' })
  user?: AdminUserDto;

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

  @ApiPropertyOptional({
    description:
      "Jeton d'appareil de confiance (aléatoire 256 bits, 30 jours), uniquement si `rememberDevice` était vrai. À stocker dans le cookie `drama_admin_device` et à renvoyer dans `deviceToken` au login.",
  })
  deviceToken?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  deviceTokenExpiresAt?: string;
}

export class TrustedDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Chrome sur Linux' })
  label: string;

  @ApiProperty({ description: 'Appareil de la session courante (contrat v1.4)' })
  current: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastUsedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}
