import { Controller, Post, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageTrackingController {
  constructor(
    private usageTrackingService: UsageTrackingService
  ) {}

  @Post('track/lite-message')
  async trackLiteMessage(@Req() req) {
    try {
      const userId = req.user.id;
      const result = await this.usageTrackingService.trackLiteMessage(userId);
      return { success: result };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error tracking lite message usage',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('track/think-message')
  async trackThinkMessage(@Req() req) {
    try {
      const userId = req.user.id;
      const result = await this.usageTrackingService.trackThinkMessage(userId);
      return { success: result };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error tracking think message usage',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('track/flashcards')
  async trackFlashcards(@Req() req, @Body() body: { count: number }) {
    try {
      const userId = req.user.id;
      const count = body.count || 1;
      const result = await this.usageTrackingService.trackFlashcards(userId, count);
      return { success: result };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error tracking flashcard usage',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('track/quiz-questions')
  async trackQuizQuestions(@Req() req, @Body() body: { count: number }) {
    try {
      const userId = req.user.userId;
      const count = body.count || 1;
      const result = await this.usageTrackingService.trackQuizQuestions(userId, count);
      return { success: result };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error tracking quiz question usage',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('check/lite-message')
  async canUseLiteMessage(@Req() req) {
    try {
      const userId = req.user.userId;
      const canUse = await this.usageTrackingService.canUseFeature(userId, 'liteMessage');
      return { 
        canUse,
        remaining: await this.usageTrackingService.getRemainingUsage(userId, 'liteMessage')
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error checking lite message limit',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('check/think-message')
  async canUseThinkMessage(@Req() req) {
    try {
      const userId = req.user.userId;
      const canUse = await this.usageTrackingService.canUseFeature(userId, 'thinkMessage');
      return { 
        canUse,
        remaining: await this.usageTrackingService.getRemainingUsage(userId, 'thinkMessage')
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error checking think message limit',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('check/flashcard')
  async canUseFlashcard(@Req() req, @Body() body: { count: number }) {
    try {
      const userId = req.user.userId;
      const count = body.count || 1;
      
      // Get remaining and check if enough for requested count
      const remaining = await this.usageTrackingService.getRemainingUsage(userId, 'flashcard');
      const canUse = remaining >= count;
      
      return { canUse, remaining };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error checking flashcard limit',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('check/quiz-question')
  async canUseQuizQuestion(@Req() req, @Body() body: { count: number }) {
    try {
      const userId = req.user.userId;
      const count = body.count || 1;
      
      // Get remaining and check if enough for requested count
      const remaining = await this.usageTrackingService.getRemainingUsage(userId, 'quizQuestion');
      const canUse = remaining >= count;
      
      return { canUse, remaining };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error checking quiz question limit',
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
