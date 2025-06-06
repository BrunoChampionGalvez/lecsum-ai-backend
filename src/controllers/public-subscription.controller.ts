import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service';

@Controller('public/subscription')
export class PublicSubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  @Get('plans')
  async getAvailablePlans() {
    try {
      return await this.subscriptionService.getAllSubscriptionPlans();
    } catch {
      throw new HttpException(
        'Error fetching subscription plans',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
