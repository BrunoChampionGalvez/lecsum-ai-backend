import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from '../services/subscription.service';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { SubscriptionController } from '../controllers/subscription.controller';
import { UsageTrackingController } from '../controllers/usage-tracking.controller';
import { PublicSubscriptionController } from '../controllers/public-subscription.controller';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserSubscription } from '../entities/user-subscription.entity';
import { SubscriptionUsage } from '../entities/subscription-usage.entity';
import { User } from '../entities/user.entity';
import { Flashcard } from '../entities/flashcard.entity'; // Add import
import { QuizQuestion } from '../entities/quiz-question.entity'; // Add import

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      UserSubscription,
      SubscriptionUsage,
      User,
      Flashcard,       // Add entity
      QuizQuestion,    // Add entity
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
