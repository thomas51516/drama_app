import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AdminRole } from '../../../generated/prisma/client.js';
import { AUDIT_TARGET_TYPES, type AuditTargetType } from '../../audit/audit.service.js';

/** Politique de mot de passe des comptes internes (B-13) : 10 caractères minimum. */
export const ADMIN_PASSWORD_MIN_LENGTH = 10;
export const ADMIN_PASSWORD_MAX_LENGTH = 200;

export class AdminAccountDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'editor@drama.local' })
  email: string;

  @ApiProperty({ example: 'Éditeur' })
  displayName: string;

  @ApiProperty({ enum: Object.values(AdminRole) })
  role: AdminRole;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ description: '2FA active ; `false` = configuration à la prochaine connexion' })
  totpEnrolled: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastLoginAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class CreateAdminAccountDto {
  @ApiProperty({ example: 'editor@drama.local' })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'Éditeur', minLength: 1, maxLength: 80 })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(80)
  displayName: string;

  @ApiProperty({ enum: Object.values(AdminRole) })
  @IsEnum(AdminRole)
  role: AdminRole;

  @ApiProperty({
    minLength: ADMIN_PASSWORD_MIN_LENGTH,
    maxLength: ADMIN_PASSWORD_MAX_LENGTH,
    description: 'Mot de passe initial (10 caractères minimum)',
  })
  @IsString()
  @Length(ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_MAX_LENGTH, {
    message: `password must be between ${ADMIN_PASSWORD_MIN_LENGTH} and ${ADMIN_PASSWORD_MAX_LENGTH} characters`,
  })
  password: string;
}

export class UpdateAdminAccountDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ enum: Object.values(AdminRole) })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional({ description: '`false` désactive le compte (connexion et jetons refusés)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetAdminPasswordDto {
  @ApiProperty({ minLength: ADMIN_PASSWORD_MIN_LENGTH, maxLength: ADMIN_PASSWORD_MAX_LENGTH })
  @IsString()
  @Length(ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_MAX_LENGTH, {
    message: `password must be between ${ADMIN_PASSWORD_MIN_LENGTH} and ${ADMIN_PASSWORD_MAX_LENGTH} characters`,
  })
  password: string;
}

// ---------------------------------------------------------------------------
// Journal d'audit
// ---------------------------------------------------------------------------

export class AuditLogDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'null = action système',
  })
  actorId: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'editor@drama.local' })
  actorEmail: string | null;

  @ApiProperty({ example: 'series.update', description: 'Verbe stable `<cible>.<action>`' })
  action: string;

  @ApiProperty({ enum: AUDIT_TARGET_TYPES })
  targetType: string;

  @ApiProperty({ type: String, nullable: true })
  targetId: string | null;

  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  oldValue: unknown;

  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  newValue: unknown;

  @ApiProperty({ type: String, nullable: true })
  ip: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;

  @ApiPropertyOptional({ format: 'uuid', description: 'Auteur' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({
    example: 'series.',
    description: 'Action exacte (`series.update`) ou préfixe terminé par un point (`series.`)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ enum: AUDIT_TARGET_TYPES })
  @IsOptional()
  @IsEnum(AUDIT_TARGET_TYPES)
  targetType?: AuditTargetType;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Borne inférieure (incluse)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Borne supérieure (incluse)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class AuditLogListDto {
  @ApiProperty({ type: [AuditLogDto] })
  items: AuditLogDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
