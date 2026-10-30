import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { UserDto } from './user.dto.js';

/** Session ouverte par une connexion Google, OTP ou e-mail (contrat public v1.2 `AuthSession`). */
export class AuthSessionDto {
  @ApiProperty({ description: 'JWT à présenter dans `Authorization: Bearer <token>`.' })
  accessToken: string;

  @ApiProperty({
    description: 'Jeton opaque à usage unique, à renouveler avec `POST /auth/refresh` (rotation).',
  })
  refreshToken: string;

  @ApiProperty({ description: "Durée de vie du JWT d'accès en secondes.", example: 900 })
  expiresIn: number;

  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({
    description:
      "`true` si le compte invité porté par le jeton de l'appel a été rattaché (inscrit en place) ou fusionné dans le compte retrouvé (M-50).",
  })
  linked: boolean;
}

const DEVICE_ID = {
  description: "Identifiant d'installation généré par l'app (M-50).",
  minLength: 8,
  maxLength: 128,
  example: '3f2c1a9e-5b7d-4c8e-9f0a-1b2c3d4e5f60',
};

export class GoogleAuthDto {
  @ApiProperty({ description: 'ID token Google (Credential Manager / One Tap)' })
  @IsString()
  @Length(20, 4096)
  idToken: string;

  @ApiProperty(DEVICE_ID)
  @IsString()
  @Length(8, 128)
  deviceId: string;
}

export class OtpRequestDto {
  @ApiProperty({ description: 'Numéro E.164', example: '+22890000000' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164' })
  phone: string;
}

export class OtpRequestResponseDto {
  @ApiProperty({ format: 'uuid', description: 'À renvoyer avec le code' })
  requestId: string;

  @ApiProperty({ example: 300, description: 'Validité du code en secondes' })
  expiresIn: number;

  @ApiProperty({
    example: 60,
    description: 'Délai en secondes avant de pouvoir redemander un code',
  })
  resendAfter: number;
}

export class OtpVerifyDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Length(36, 36)
  requestId: string;

  @ApiProperty({ example: '123456', description: 'Code à 6 chiffres reçu par SMS' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  @ApiProperty(DEVICE_ID)
  @IsString()
  @Length(8, 128)
  deviceId: string;
}

export class EmailCredentialsDto {
  @ApiProperty({ example: 'awa@example.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'motdepasse-solide' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty(DEVICE_ID)
  @IsString()
  @Length(8, 128)
  deviceId: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'Jeton de rafraîchissement de la session à fermer.' })
  @IsString()
  @Length(32, 256)
  refreshToken: string;
}
