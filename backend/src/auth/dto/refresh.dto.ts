import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Jeton de rafraîchissement opaque reçu lors de la dernière émission.',
  })
  @IsString()
  @Length(32, 256)
  refreshToken: string;
}
