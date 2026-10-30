import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminScheduleService } from './admin-schedule.service.js';
import { ScheduleDto, ScheduleQueryDto } from './dto/admin-schedule.dto.js';

/** Publications programmées (B-04). Lecture : tout compte interne actif. */
@ApiTags('admin-schedule')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin/schedule')
export class AdminScheduleController {
  constructor(private readonly schedule: AdminScheduleService) {}

  @Get()
  @ApiOperation({
    summary: 'Calendrier des publications à venir',
    description:
      'Séries et épisodes dont `publishedAt` tombe dans la fenêtre `from`..`to` (défaut : 30 jours à partir de maintenant, 366 au plus). `willBeVisible` indique si l’élément apparaîtra bien au public à la date (série publiée, épisode READY). La tâche planifiée invalide le cache chaque minute quand une date est atteinte.',
  })
  @ApiOkResponse({ type: ScheduleDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR | SCHEDULE_RANGE_INVALID | SCHEDULE_RANGE_TOO_WIDE',
  })
  list(@Query() query: ScheduleQueryDto): Promise<ScheduleDto> {
    return this.schedule.list(query);
  }
}
