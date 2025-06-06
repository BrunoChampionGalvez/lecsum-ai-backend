import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionUsage } from '../entities/subscription-usage.entity';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class UsageTrackingService {
  constructor(
    @InjectRepository(SubscriptionUsage)
    private subscriptionUsageRepository: Repository<SubscriptionUsage>,
    private subscriptionService: SubscriptionService
  ) {}

  /**
   * Track usage of a lite message
   */
  async trackLiteMessage(userId: string): Promise<boolean> {
    return this.incrementUsage(userId, 'liteMessagesUsed');
  }

  /**
   * Track usage of a think message
   */
  async trackThinkMessage(userId: string): Promise<boolean> {
    return this.incrementUsage(userId, 'thinkMessagesUsed');
  }

  /**
   * Track usage of flashcards
   */
  async trackFlashcards(userId: string, count = 1): Promise<boolean> {
    return this.incrementUsage(userId, 'flashcardsGenerated', count);
  }

  /**
   * Track usage of quiz questions
   */
  async trackQuizQuestions(userId: string, count = 1): Promise<boolean> {
    return this.incrementUsage(userId, 'quizQuestionsGenerated', count);
  }

  /**
   * Check if a user can use a specific feature based on their limits
   */
  async canUseFeature(
    userId: string,
    feature: 'liteMessage' | 'thinkMessage' | 'flashcard' | 'quizQuestion'
  ): Promise<boolean> {
    try {
      const subscriptionDetails = await this.subscriptionService.getUserSubscriptionDetails(userId);
      
      // If no subscription is found, user cannot use features
      if (!subscriptionDetails) {
        return false;
      }
      
      const { limits, usage } = subscriptionDetails;

      switch (feature) {
        case 'liteMessage':
          return usage.liteMessagesUsed < limits.liteMessageLimit;
        case 'thinkMessage':
          return usage.thinkMessagesUsed < limits.thinkMessageLimit;
        case 'flashcard':
          return usage.flashcardsGenerated < limits.flashcardsLimit;
        case 'quizQuestion':
          return usage.quizQuestionsGenerated < limits.quizQuestionsLimit;
        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking feature usage:', error);
      return false;
    }
  }

  /**
   * Get the remaining number of a specific feature a user can use
   */
  async getRemainingUsage(
    userId: string,
    feature: 'liteMessage' | 'thinkMessage' | 'flashcard' | 'quizQuestion'
  ): Promise<number> {
    try {
      const subscriptionDetails = await this.subscriptionService.getUserSubscriptionDetails(userId);
      
      // If no subscription is found, user has 0 remaining uses
      if (!subscriptionDetails) {
        return 0;
      }
      
      const { limits, usage } = subscriptionDetails;

      switch (feature) {
        case 'liteMessage':
          return Math.max(0, limits.liteMessageLimit - usage.liteMessagesUsed);
        case 'thinkMessage':
          return Math.max(0, limits.thinkMessageLimit - usage.thinkMessagesUsed);
        case 'flashcard':
          return Math.max(0, limits.flashcardsLimit - usage.flashcardsGenerated);
        case 'quizQuestion':
          return Math.max(0, limits.quizQuestionsLimit - usage.quizQuestionsGenerated);
        default:
          return 0;
      }
    } catch (error) {
      console.error('Error getting remaining usage:', error);
      return 0;
    }
  }

  /**
   * Reset usage counters for a user (typically done when subscription renews)
   */
  async resetUsageCounters(userId: string): Promise<void> {
    await this.subscriptionUsageRepository.update(
      { userId },
      {
        liteMessagesUsed: 0,
        thinkMessagesUsed: 0,
        flashcardsGenerated: 0,
        quizQuestionsGenerated: 0,
        lastResetDate: new Date()
      }
    );
  }

  /**
   * Increment a specific usage counter
   */
  private async incrementUsage(
    userId: string,
    usageType: 'liteMessagesUsed' | 'thinkMessagesUsed' | 'flashcardsGenerated' | 'quizQuestionsGenerated',
    incrementBy = 1
  ): Promise<boolean> {
    // Get current usage
    let usage = await this.subscriptionUsageRepository.findOne({
      where: { userId }
    });

    // If no usage record exists, create one
    if (!usage) {
      usage = await this.subscriptionUsageRepository.save({
        userId,
        liteMessagesUsed: 0,
        thinkMessagesUsed: 0,
        flashcardsGenerated: 0,
        quizQuestionsGenerated: 0,
        lastResetDate: new Date()
      });
    }

    // Map feature to the corresponding limit check
    let featureType: 'liteMessage' | 'thinkMessage' | 'flashcard' | 'quizQuestion';
    
    switch (usageType) {
      case 'liteMessagesUsed':
        featureType = 'liteMessage';
        break;
      case 'thinkMessagesUsed':
        featureType = 'thinkMessage';
        break;
      case 'flashcardsGenerated':
        featureType = 'flashcard';
        break;
      case 'quizQuestionsGenerated':
        featureType = 'quizQuestion';
        break;
    }

    // Check if the user is within their subscription limits
    const canUse = await this.canUseFeature(userId, featureType);
    if (!canUse) {
      return false; // Limit exceeded
    }

    // Update the counter
    usage[usageType] += incrementBy;
    await this.subscriptionUsageRepository.save(usage);
    
    return true;
  }
}
