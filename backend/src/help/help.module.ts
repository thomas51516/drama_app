import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin/auth/admin-auth.module.js';
import { AdminFaqController, AdminSupportController } from './admin-help.controller.js';
import { FaqService } from './faq.service.js';
import { HelpController } from './help.controller.js';
import { SupportService } from './support.service.js';

/** Centre d'aide : FAQ, contact et support (M-53, S06-BE-02, B-03bis). */
@Module({
  imports: [AdminAuthModule],
  controllers: [HelpController, AdminFaqController, AdminSupportController],
  providers: [FaqService, SupportService],
})
export class HelpModule {}
