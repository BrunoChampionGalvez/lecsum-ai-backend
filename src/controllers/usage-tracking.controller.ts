import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { UsageTrackingService } from '../services/usage-tracking.service.js';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard.js';
import { Request } from 'express';

interface UserPayload {
  id: string;
  email: string;
}

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageTrackingController {
  constructor(private usageTrackingService: UsageTrackingService) {}

  @Post('track/lite-message')
  async trackLiteMessage(@Req() req: Request & { user: UserPayload }) {
    try {
      const userId = req.user.id;
      const result = await this.usageTrackingService.trackLiteMessage(userId);
      return { success: result };
    } catch (error: unknown) {
      let errorMessage = 'Error tracking lite message usage';
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

  @Post('track/think-message')
  async trackThinkMessage(@Req() req: Request & { user: UserPayload }) {
    try {
      const userId = req.user.id;
      const result = await this.usageTrackingService.trackThinkMessage(userId);
      return { success: result };
    } catch (error: unknown) {
      let errorMessage = 'Error tracking think message usage';
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

  @Post('track/flashcards')
  async trackFlashcards(
    @Req() req: Request & { user: UserPayload },
    @Body() body: { count: number },
  ) {
    try {
      const userId = req.user.id;
      const count = body.count || 1;
      const result = await this.usageTrackingService.trackFlashcards(
        userId,
        count,
      );
      return { success: result };
    } catch (error: unknown) {
      let errorMessage = 'Error tracking flashcard usage';
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

  @Post('track/quiz-questions')
  async trackQuizQuestions(
    @Req() req: Request & { user: UserPayload },
    @Body() body: { count: number },
  ) {
    try {
      const userId = req.user.id;
      const count = body.count || 1;
      const result = await this.usageTrackingService.trackQuizQuestions(
        userId,
        count,
      );
      return { success: result };
    } catch (error: unknown) {
      let errorMessage = 'Error tracking quiz question usage';
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

  @Post('check/lite-message')
  async canUseLiteMessage(@Req() req: Request & { user: UserPayload }) {
    try {
      const userId = req.user.id;
      const canUse = await this.usageTrackingService.canUseFeature(
        userId,
        'liteMessage',
      );
      return {
        canUse,
        remaining: await this.usageTrackingService.getRemainingUsage(
          userId,
          'liteMessage',
        ),
      };
    } catch (error: unknown) {
      let errorMessage = 'Error checking lite message limit';
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

  @Post('check/think-message')
  async canUseThinkMessage(@Req() req: Request & { user: UserPayload }) {
    try {
      const userId = req.user.id;
      const canUse = await this.usageTrackingService.canUseFeature(
        userId,
        'thinkMessage',
      );
      return {
        canUse,
        remaining: await this.usageTrackingService.getRemainingUsage(
          userId,
          'thinkMessage',
        ),
      };
    } catch (error: unknown) {
      let errorMessage = 'Error checking think message limit';
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

  @Post('check/flashcard')
  async canUseFlashcard(
    @Req() req: Request & { user: UserPayload },
    @Body() body: { count: number },
  ) {
    try {
      const userId = req.user.id;
      const count = body.count || 1;

      // Get remaining and check if enough for requested count
      const remaining = await this.usageTrackingService.getRemainingUsage(
        userId,
        'flashcard',
      );
      const canUse = remaining >= count;

      return { canUse, remaining };
    } catch (error: unknown) {
      let errorMessage = 'Error checking flashcard limit';
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

  @Post('check/quiz-question')
  async canUseQuizQuestion(
    @Req() req: Request & { user: UserPayload },
    @Body() body: { count: number },
  ) {
    try {
      const userId = req.user.id;
      const count = body.count || 1;

      // Get remaining and check if enough for requested count
      const remaining = await this.usageTrackingService.getRemainingUsage(
        userId,
        'quizQuestion',
      );
      const canUse = remaining >= count;

      return { canUse, remaining };
    } catch (error: unknown) {
      let errorMessage = 'Error checking quiz question limit';
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
