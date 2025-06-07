import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service'; // Adjusted path assuming controller is in modules/ and service in services/

@Controller('admin')
export class AdminController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('recalculate-all-usage')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted: The request has been accepted for processing, but the processing has not been completed.
  async recalculateAllUsage() {
    // Intentionally not awaiting this, as it could be a long process.
    // The client will get an immediate 202 response.
    // The actual work happens in the background.
    this.subscriptionService.recalculateHistoricalUsageForAllUsers()
      .then(() => {
        console.log('[AdminController] Recalculate all usage process completed successfully via admin endpoint.');
      })
      .catch(error => {
        console.error('[AdminController] Error during recalculate all usage process initiated via admin endpoint:', error);
      });

    return { message: 'Recalculation process for historical usage has been initiated.' };
  }
}
