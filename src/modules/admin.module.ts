import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
// Corrected path to SubscriptionModule
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    SubscriptionModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
