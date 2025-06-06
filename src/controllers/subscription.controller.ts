import { Controller, Get, Post, Body, UseGuards, Req, HttpException, HttpStatus, Patch } from '@nestjs/common';
import { SubscriptionService } from '../services/subscription.service';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { SubscriptionPlanType } from '../entities/subscription-plan.entity';

@Controller('subscription')
export class SubscriptionController {
  constructor(
    private subscriptionService: SubscriptionService,
    private usageTrackingService: UsageTrackingService
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getUserSubscription(@Req() req) {
    try {
      const userId = req.user.id;
      const subscription = await this.subscriptionService.getUserSubscriptionDetails(userId);
      
      // If no subscription is found, return a default structure instead of an error
      if (!subscription) {
        return {
          plan: {
            name: 'No Active Subscription',
            type: 'none',
            isTrialPeriod: false,
            trialDaysLeft: 0,
            endDate: new Date().toISOString(),
            isActive: false
          },
          limits: {
            liteMessageLimit: 0,
            thinkMessageLimit: 0,
            flashcardsLimit: 0,
            quizQuestionsLimit: 0
          },
          usage: {
            liteMessagesUsed: 0,
            thinkMessagesUsed: 0,
            flashcardsGenerated: 0,
            quizQuestionsGenerated: 0
          }
        };
      }
      
      return subscription;
    } catch (error) {
      throw new HttpException(
        error.message || 'Error fetching subscription details',
        HttpStatus.BAD_REQUEST
      );
    }
  }
  
  @Get('plans')
  @UseGuards(JwtAuthGuard)
  async getAvailablePlans() {
    try {
      return await this.subscriptionService.getAllSubscriptionPlans();
    } catch (error) {
      throw new HttpException(
        'Error fetching subscription plans',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  async upgradePlan(@Req() req, @Body() body: { planType: SubscriptionPlanType }) {
    try {
      const userId = req.user.id;
      return await this.subscriptionService.upgradeSubscription(userId, body.planType);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error upgrading subscription',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  async getUsage(@Req() req) {
    try {
      const userId = req.user.id;
      const subscriptionDetails = await this.subscriptionService.getUserSubscriptionDetails(userId);
      
      // If no subscription details returned, provide default zeroed usage data
      if (!subscriptionDetails) {
        return {
          plan: {
            name: 'No Active Subscription',
            type: 'none',
            isTrialPeriod: false,
            trialDaysLeft: 0,
            endDate: new Date().toISOString(),
            isActive: false
          },
          limits: {
            liteMessageLimit: 0,
            thinkMessageLimit: 0,
            flashcardsLimit: 0,
            quizQuestionsLimit: 0
          },
          usage: {
            liteMessagesUsed: 0,
            thinkMessagesUsed: 0,
            flashcardsGenerated: 0,
            quizQuestionsGenerated: 0
          },
          remaining: {
            liteMessages: 0,
            thinkMessages: 0,
            flashcards: 0,
            quizQuestions: 0
          }
        };
      }
      
      return {
        plan: subscriptionDetails.plan,
        limits: subscriptionDetails.limits,
        usage: subscriptionDetails.usage,
        remaining: {
          liteMessages: Math.max(0, subscriptionDetails.limits.liteMessageLimit - subscriptionDetails.usage.liteMessagesUsed),
          thinkMessages: Math.max(0, subscriptionDetails.limits.thinkMessageLimit - subscriptionDetails.usage.thinkMessagesUsed),
          flashcards: Math.max(0, subscriptionDetails.limits.flashcardsLimit - subscriptionDetails.usage.flashcardsGenerated),
          quizQuestions: Math.max(0, subscriptionDetails.limits.quizQuestionsLimit - subscriptionDetails.usage.quizQuestionsGenerated)
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error fetching usage details',
        HttpStatus.BAD_REQUEST
      );
    }
  }
  
  @Patch('cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(@Req() req) {
    try {
      const userId = req.user.id;
      return await this.subscriptionService.cancelUserSubscription(userId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Error canceling subscription',
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
