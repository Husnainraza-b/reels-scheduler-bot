import { Controller, Get, UseGuards, Logger } from '@nestjs/common';
import { AnalyticsService, AnalyticsOverview } from './analytics.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  // @UseGuards(AdminAuthGuard) // Optionally restrict if needed, but since it's used by dashboard, we should probably add the guard. Oh wait, dashboard routes are under /dashboard/... Let's add it. Wait, the frontend might call /api/analytics/overview instead of /dashboard/analytics/overview. Let's remove the guard for now or use it if frontend passes token. Actually, we'll keep it simple and just use the guard if other endpoints do. The prompt says GET /api/analytics/overview. Let's not add the guard right now unless we know it's needed. Wait, in `AccountsController` it uses `AdminAuthGuard`. I'll add the guard. Let's check if AdminAuthGuard exists in my imports. Yes.
  @UseGuards(AdminAuthGuard)
  async getOverview(): Promise<AnalyticsOverview> {
    try {
      return await this.analyticsService.getOverview();
    } catch (error) {
      this.logger.error(
        'Failed to get analytics overview',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
