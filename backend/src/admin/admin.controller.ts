import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { AdminService } from './admin.service.js';

@ApiExcludeController()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // TODO S03-BE-04 : auth des comptes internes (Argon2, 2FA)
  @Public()
  @Post('auth/login')
  login(@Body() body: { email: string; password: string }): never {
    return this.admin.login(body.email, body.password);
  }

  // TODO S03-BE-01 : protégé par une garde de rôle admin
  @Get('series')
  series(): never {
    return this.admin.listSeries();
  }
}
