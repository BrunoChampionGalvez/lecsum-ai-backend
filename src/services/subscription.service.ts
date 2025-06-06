import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SubscriptionPlan,
  SubscriptionPlanType,
} from '../entities/subscription-plan.entity.js';
import { UserSubscription } from '../entities/user-subscription.entity.js';
import { SubscriptionUsage } from '../entities/subscription-usage.entity.js';
import { User } from '../entities/user.entity.js';

interface SubscriptionLimits {
  liteMessageLimit: number;
  thinkMessageLimit: number;
  flashcardsLimit: number;
  quizQuestionsLimit: number;
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private subscriptionPlanRepository: Repository<SubscriptionPlan>,
    @InjectRepository(UserSubscription)
    private userSubscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(SubscriptionUsage)
    private subscriptionUsageRepository: Repository<SubscriptionUsage>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    // Initialize default plans if they don't exist
    void this.initializeDefaultPlans();
  }

  private async initializeDefaultPlans() {
    const existingPlans = await this.subscriptionPlanRepository.find();
    if (existingPlans.length === 0) {
      await this.subscriptionPlanRepository.save([
        {
          type: SubscriptionPlanType.FREE_TRIAL,
          name: 'Free Trial',
          description: 'Try LecSum AI features for free for one week',
          liteMessageLimit: 40,
          thinkMessageLimit: 0,
          flashcardsLimit: 50,
          quizQuestionsLimit: 50,
          trialDurationDays: 7,
          isActive: true,
        },
        {
          type: SubscriptionPlanType.STARTER,
          name: 'Starter Plan',
          description: 'Basic features for beginners',
          liteMessageLimit: 150,
          thinkMessageLimit: 30,
          flashcardsLimit: 300,
          quizQuestionsLimit: 300,
          isActive: true,
        },
        {
          type: SubscriptionPlanType.PRO,
          name: 'Pro Plan',
          description: 'All premium features',
          liteMessageLimit: 300,
          thinkMessageLimit: 60,
          flashcardsLimit: 600,
          quizQuestionsLimit: 600,
          isActive: true,
        },
      ]);
    }
  }

  /**
   * Assign the default free trial subscription to a new user
   */
  async assignFreeTrialToNewUser(userId: string) {
    const freeTrial = await this.subscriptionPlanRepository.findOne({
      where: { type: SubscriptionPlanType.FREE_TRIAL },
    });

    if (!freeTrial) {
      throw new Error('Free trial plan not found');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + freeTrial.trialDurationDays);

    await this.userSubscriptionRepository.save({
      userId,
      planId: freeTrial.id,
      startDate,
      endDate,
      isTrialPeriod: true,
      isActive: true,
    });

    // Initialize usage stats
    await this.subscriptionUsageRepository.save({
      userId,
      liteMessagesUsed: 0,
      thinkMessagesUsed: 0,
      flashcardsGenerated: 0,
      quizQuestionsGenerated: 0,
      lastResetDate: new Date(),
    });
  }

  /**
   * Fetch the active subscription for a user
   */
  async getUserActiveSubscription(userId: string) {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: {
        userId,
        isActive: true,
      },
      relations: ['plan'],
    });

    return subscription;
  }

  /**
   * Fetch the user's latest subscription regardless of active status
   */
  async getUserLatestSubscription(userId: string) {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: {
        userId,
      },
      relations: ['plan'],
      order: {
        createdAt: 'DESC', // Get the most recent subscription
      },
    });

    return subscription;
  }

  /**
   * Check if a user has an active subscription and hasn't exceeded limits
   */
  async checkUserSubscriptionLimits(
    userId: string,
  ): Promise<SubscriptionLimits> {
    const subscription = await this.getUserActiveSubscription(userId);

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    return {
      liteMessageLimit: subscription.plan.liteMessageLimit,
      thinkMessageLimit: subscription.plan.thinkMessageLimit,
      flashcardsLimit: subscription.plan.flashcardsLimit,
      quizQuestionsLimit: subscription.plan.quizQuestionsLimit,
    };
  }

  /**
   * Check if a user's trial has expired
   */
  async isTrialExpired(userId: string): Promise<boolean> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: {
        userId,
        isTrialPeriod: true,
      },
    });

    if (!subscription) {
      return true; // No trial subscription found
    }

    const now = new Date();
    return subscription.endDate < now;
  }

  /**
   * Get the amount of days left in a user's trial
   */
  async getTrialDaysLeft(userId: string): Promise<number> {
    const subscription = await this.userSubscriptionRepository.findOne({
      where: {
        userId,
        isTrialPeriod: true,
      },
    });

    if (!subscription || subscription.endDate < new Date()) {
      return 0; // No active trial or trial expired
    }

    const now = new Date();
    const diffTime = Math.abs(subscription.endDate.getTime() - now.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Get comprehensive subscription details for a user
   */
  async getUserSubscriptionDetails(userId: string) {
    // First try to get an active subscription
    let subscription = await this.getUserActiveSubscription(userId);

    // If no active subscription exists, get the most recent subscription
    if (!subscription) {
      subscription = await this.getUserLatestSubscription(userId);

      // If no subscription at all, return null - frontend will handle this case
      if (!subscription) {
        // No subscription found at all, return gracefully
        // Frontend will handle this case with proper messaging
        return null;
      }
    }

    // If we get here, subscription is guaranteed to be defined
    if (!subscription) {
      throw new Error('Unexpected error: No subscription found');
    }

    // Get usage data or create default values if none exists
    const usage = (await this.subscriptionUsageRepository.findOne({
      where: { userId },
    })) || {
      liteMessagesUsed: 0,
      thinkMessagesUsed: 0,
      flashcardsGenerated: 0,
      quizQuestionsGenerated: 0,
    };

    const trialDaysLeft = subscription.isTrialPeriod
      ? await this.getTrialDaysLeft(userId)
      : 0;

    return {
      plan: {
        name: subscription.plan.name,
        type: subscription.plan.type,
        isTrialPeriod: subscription.isTrialPeriod,
        trialDaysLeft,
        endDate: subscription.endDate,
        isActive: subscription.isActive,
      },
      limits: {
        liteMessageLimit: subscription.plan.liteMessageLimit,
        thinkMessageLimit: subscription.plan.thinkMessageLimit,
        flashcardsLimit: subscription.plan.flashcardsLimit,
        quizQuestionsLimit: subscription.plan.quizQuestionsLimit,
      },
      usage: usage
        ? {
            liteMessagesUsed: usage.liteMessagesUsed,
            thinkMessagesUsed: usage.thinkMessagesUsed,
            flashcardsGenerated: usage.flashcardsGenerated,
            quizQuestionsGenerated: usage.quizQuestionsGenerated,
          }
        : {
            liteMessagesUsed: 0,
            thinkMessagesUsed: 0,
            flashcardsGenerated: 0,
            quizQuestionsGenerated: 0,
          },
    };
  }

  /**
   * Upgrade a user's subscription to a new plan
   */
  async upgradeSubscription(userId: string, planType: SubscriptionPlanType) {
    // Find the user's current subscription
    const currentSubscription = await this.getUserActiveSubscription(userId);
    if (!currentSubscription) {
      throw new Error('No active subscription found');
    }

    // Find the requested plan
    const newPlan = await this.subscriptionPlanRepository.findOne({
      where: { type: planType },
    });

    if (!newPlan) {
      throw new Error('Subscription plan not found');
    }

    // Check if user is trying to downgrade from a paid plan to a free trial
    if (
      currentSubscription.plan.type !== SubscriptionPlanType.FREE_TRIAL &&
      newPlan.type === SubscriptionPlanType.FREE_TRIAL
    ) {
      throw new Error(
        'Downgrading from a paid plan to a free trial is not allowed',
      );
    }

    // Calculate the new end date (30 days from now for paid plans)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    // Update the subscription
    currentSubscription.planId = newPlan.id;
    currentSubscription.startDate = new Date();
    currentSubscription.endDate = endDate;
    currentSubscription.isActive = true;
    currentSubscription.isTrialPeriod = false;

    await this.userSubscriptionRepository.save(currentSubscription);

    // Return the updated subscription details
    return this.getUserSubscriptionDetails(userId);
  }

  /**
   * Cancel a user's subscription
   * This doesn't immediately revoke access but sets isActive to false
   * and keeps the existing endDate for access until expiration
   */
  async cancelUserSubscription(userId: string) {
    // Find the user's current subscription
    const currentSubscription = await this.getUserActiveSubscription(userId);
    if (!currentSubscription) {
      throw new Error('No active subscription found');
    }

    // Mark the subscription as canceled (not active) but keep the end date
    // This allows the user to still access features until the subscription period ends
    currentSubscription.isActive = false;

    await this.userSubscriptionRepository.save(currentSubscription);

    // Return the updated subscription details
    return this.getUserSubscriptionDetails(userId);
  }

  /**
   * Get all available subscription plans
   */
  async getAllSubscriptionPlans() {
    return this.subscriptionPlanRepository.find({
      where: { isActive: true },
      order: {
        // Order: Free Trial first, then Starter, then Pro
        type: 'ASC',
      },
    });
  }
}
