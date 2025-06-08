import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { SubscriptionPlanType } from '../entities/subscription-plan.entity';
import { Request } from 'express';

interface UserPayload {
  id: string;
  email: string;
}

@Controller('subscription')
export class SubscriptionController {
  // Simple memory cache with TTL
  private usageCache: Record<string, { data: any; timestamp: number }> = {};
  private CACHE_TTL_MS = 10000; // 10 seconds

  constructor(
    private subscriptionService: SubscriptionService,
    private usageTrackingService: UsageTrackingService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getUserSubscription(@Req() req: Request & { user: UserPayload }) {
    try {
      const userId = req.user.id;
      const subscription =
        await this.subscriptionService.getUserSubscriptionDetails(userId);

      // If no subscription is found, return a default structure instead of an error
      if (!subscription) {
        return {
          plan: {
            name: 'No Active Subscription',
            type: 'none',
            isTrialPeriod: false,
            trialDaysLeft: 0,
            endDate: new Date().toISOString(),
            isActive: false,
          },
          limits: {
            liteMessageLimit: 0,
            thinkMessageLimit: 0,
            flashcardsLimit: 0,
            quizQuestionsLimit: 0,
          },
          usage: {
            liteMessagesUsed: 0,
            thinkMessagesUsed: 0,
            flashcardsGenerated: 0,
            quizQuestionsGenerated: 0,
          },
        };
      }

      return subscription;
    } catch (error: unknown) {
      let errorMessage = 'Error fetching subscription details';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (
        error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        errorMessage = (error as { message: string }).message;
      }
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard)
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

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  async upgradePlan(
    @Req() req: Request & { user: UserPayload },
    @Body() body: { planType: SubscriptionPlanType },
  ) {
    try {
      const userId = req.user.id;
      return await this.subscriptionService.upgradeSubscription(
        userId,
        body.planType,
      );
    } catch (error: unknown) {
      let errorMessage = 'Error upgrading subscription';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (
        error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        errorMessage = (error as { message: string }).message;
      }
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  async getUsage(@Req() req: Request & { user: UserPayload }) {
    const userId = req.user.id;
    
    // Check if we have a cached response for this user
    const now = Date.now();
    const cachedItem = this.usageCache[userId];
    if (cachedItem && now - cachedItem.timestamp < this.CACHE_TTL_MS) {
      return cachedItem.data;
    }
    try {
      const subscriptionDetails =
        await this.subscriptionService.getUserSubscriptionDetails(userId);

      // If no subscription details returned, provide default zeroed usage data
      if (!subscriptionDetails) {
        return {
          plan: {
            name: 'No Active Subscription',
            type: 'none',
            isTrialPeriod: false,
            trialDaysLeft: 0,
            endDate: new Date().toISOString(),
            isActive: false,
          },
          limits: {
            liteMessageLimit: 0,
            thinkMessageLimit: 0,
            flashcardsLimit: 0,
            quizQuestionsLimit: 0,
          },
          usage: {
            liteMessagesUsed: 0,
            thinkMessagesUsed: 0,
            flashcardsGenerated: 0,
            quizQuestionsGenerated: 0,
          },
          remaining: {
            liteMessages: 0,
            thinkMessages: 0,
            flashcards: 0,
            quizQuestions: 0,
          },
        };
      }

      const result = {
        plan: subscriptionDetails.plan,
        limits: subscriptionDetails.limits,
        usage: subscriptionDetails.usage,
        remaining: {
          liteMessages: Math.max(
            0,
            subscriptionDetails.limits.liteMessageLimit -
              subscriptionDetails.usage.liteMessagesUsed,
          ),
          thinkMessages: Math.max(
            0,
            subscriptionDetails.limits.thinkMessageLimit -
              subscriptionDetails.usage.thinkMessagesUsed,
          ),
          flashcards: Math.max(
            0,
            subscriptionDetails.limits.flashcardsLimit -
              subscriptionDetails.usage.flashcardsGenerated,
          ),
          quizQuestions: Math.max(
            0,
            subscriptionDetails.limits.quizQuestionsLimit -
              subscriptionDetails.usage.quizQuestionsGenerated,
          ),
        },
      };
      
      // Store the result in cache
      this.usageCache[userId] = { 
        data: result, 
        timestamp: now 
      };
      
      return result;
    } catch (error: unknown) {
      let errorMessage = 'Error fetching usage details';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (
        error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        errorMessage = (error as { message: string }).message;
      }
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch('cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(@Req() req: Request & { user: UserPayload }) {
    try {
      const userId = req.user.id;
      return await this.subscriptionService.cancelUserSubscription(userId);
    } catch (error: unknown) {
      let errorMessage = 'Error canceling subscription';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (
        error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        errorMessage = (error as { message: string }).message;
      }
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }
}
