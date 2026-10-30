import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SupportTicketStatus } from '../../generated/prisma/client.js';

/** Catégories de FAQ et de tickets (clés stables, libellés côté app). */
export const HELP_CATEGORIES = [
  'account',
  'coins',
  'vip',
  'playback',
  'payment',
  'content',
  'other',
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export class LocalizedTextDto {
  @ApiProperty({ description: 'Français (obligatoire)', maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  fr: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  en?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  es?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  pt?: string;
}

// --------------------------------------------------------------------- FAQ

export class FaqQueryDto {
  @ApiPropertyOptional({
    example: 'fr',
    description: 'fr, en, es ou pt (sinon Accept-Language, repli fr)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(fr|en|es|pt)$/)
  lang?: string;
}

export class FaqPublicEntryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Comment obtenir des pièces ?' })
  question: string;

  @ApiProperty()
  answer: string;
}

export class FaqCategoryDto {
  @ApiProperty({ enum: HELP_CATEGORIES, example: 'coins' })
  key: string;

  @ApiProperty({ description: 'Libellé dans la langue demandée', example: 'Pièces' })
  title: string;

  @ApiProperty({ type: [FaqPublicEntryDto] })
  entries: FaqPublicEntryDto[];
}

export class FaqPublicDto {
  @ApiProperty({ type: [FaqCategoryDto] })
  categories: FaqCategoryDto[];
}

export class FaqEntryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: HELP_CATEGORIES })
  category: string;

  @ApiProperty({ type: LocalizedTextDto })
  question: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto })
  answer: LocalizedTextDto;

  @ApiProperty()
  position: number;

  @ApiProperty()
  isPublished: boolean;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CreateFaqEntryDto {
  @ApiProperty({ enum: HELP_CATEGORIES })
  @IsEnum(HELP_CATEGORIES)
  category: HelpCategory;

  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  question: LocalizedTextDto;

  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  answer: LocalizedTextDto;

  @ApiPropertyOptional({ default: 'fin de liste', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateFaqEntryDto {
  @ApiPropertyOptional({ enum: HELP_CATEGORIES })
  @IsOptional()
  @IsEnum(HELP_CATEGORIES)
  category?: HelpCategory;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  question?: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  answer?: LocalizedTextDto;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class ReorderFaqDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Identifiants dans le nouvel ordre' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];
}

// ----------------------------------------------------------------- support

export class ContactDto {
  @ApiProperty({ maxLength: 200, example: 'Pièces non créditées' })
  @IsString()
  @Length(3, 200)
  subject: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @Length(10, 4000)
  message: string;

  @ApiPropertyOptional({ description: 'Adresse de réponse (confirmation envoyée si fournie)' })
  @IsOptional()
  @IsEmail()
  @Length(3, 320)
  email?: string;

  @ApiProperty({ enum: HELP_CATEGORIES })
  @IsEnum(HELP_CATEGORIES)
  category: HelpCategory;
}

export class ContactResultDto {
  @ApiProperty({ format: 'uuid' })
  ticketId: string;
}

export class TicketMessageDto {
  @ApiProperty({ enum: ['user', 'support'] })
  from: 'user' | 'support';

  @ApiProperty()
  body: string;

  @ApiProperty({ format: 'date-time' })
  at: string;
}

export class TicketDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Nom affiché, e-mail ou téléphone du compte', example: 'Awa' })
  userLabel: string;

  @ApiProperty({ enum: HELP_CATEGORIES })
  category: string;

  @ApiProperty()
  subject: string;

  @ApiProperty({ type: String, nullable: true, description: 'Adresse de réponse saisie' })
  email: string | null;

  @ApiProperty({ enum: Object.values(SupportTicketStatus) })
  status: SupportTicketStatus;

  @ApiProperty({ type: [TicketMessageDto] })
  messages: TicketMessageDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class TicketListQueryDto {
  @ApiPropertyOptional({ enum: Object.values(SupportTicketStatus) })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class TicketListDto {
  @ApiProperty({ type: [TicketDto], description: 'Du plus récemment mis à jour au plus ancien' })
  items: TicketDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export class ReplyTicketDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  message: string;
}
