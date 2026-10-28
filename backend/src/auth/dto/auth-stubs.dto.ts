import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/** Planifié S05-BE-01. */
export class GoogleAuthDto {
  @ApiProperty({ description: 'ID token Google (One Tap / Credential Manager)' })
  @IsString()
  @Length(20, 4096)
  idToken: string;

  @ApiPropertyOptional({
    description: 'Identifiant d’installation, pour rattacher le compte invité courant',
  })
  @IsOptional()
  @IsString()
  @Length(8, 128)
  deviceId?: string;
}

/** Planifié S05-BE-02. */
export class OtpRequestDto {
  @ApiProperty({ description: 'Numéro E.164', example: '+22890000000' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164' })
  phone: string;
}

export class OtpRequestResponseDto {
  @ApiProperty({ format: 'uuid', description: 'À renvoyer avec le code' })
  challengeId: string;

  @ApiProperty({ example: 300, description: 'Validité du code en secondes' })
  expiresIn: number;

  @ApiProperty({ example: 60, description: 'Délai avant un nouvel envoi' })
  resendAfterSeconds: number;
}

export class OtpVerifyDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Length(36, 36)
  challengeId: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{4,8}$/)
  code: string;

  @ApiPropertyOptional({
    description: 'Identifiant d’installation, pour rattacher le compte invité courant',
  })
  @IsOptional()
  @IsString()
  @Length(8, 128)
  deviceId?: string;
}
