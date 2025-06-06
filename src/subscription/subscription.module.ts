import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from '../services/subscription.service.js';
import { UsageTrackingService } from '../services/usage-tracking.service.js';
import { SubscriptionController } from '../controllers/subscription.controller.js';
import { UsageTrackingController } from '../controllers/usage-tracking.controller.js';
import { PublicSubscriptionController } from '../controllers/public-subscription.controller.js';
import { SubscriptionPlan } from '../entities/subscription-plan.entity.js';
import { UserSubscription } from '../entities/user-subscription.entity.js';
import { SubscriptionUsage } from '../entities/subscription-usage.entity.js';
import { User } from '../entities/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      UserSubscription,
      SubscriptionUsage,
      User,
    ]),
  ],
  controllers: [
    SubscriptionController,
    UsageTrackingController,
    PublicSubscriptionController,
  ],
  providers: [SubscriptionService, UsageTrackingService],
  exports: [SubscriptionService, UsageTrackingService],
})
export class SubscriptionModule {}
