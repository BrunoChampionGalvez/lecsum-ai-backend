import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UsageTrackingService } from '../services/usage-tracking.service';
import { Request } from 'express';

interface UserPayload {
  id: string;
}

interface GenerateQuizResponse {
  id: string; // Assuming this is the quizId
}
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz } from '../entities/quiz.entity';
import { QuizQuestion } from '../entities/quiz-question.entity';

@Injectable()
export class QuizUsageInterceptor implements NestInterceptor {
  constructor(
    private readonly usageTrackingService: UsageTrackingService,
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private quizQuestionRepository: Repository<QuizQuestion>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: UserPayload }>();

    // Ensure user exists and has an ID
    if (!request.user || !request.user.id) {
      throw new HttpException(
        'Unauthorized - User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userId = request.user.id; // User ID from JWT

    // Only intercept POST requests for generating quizzes
    if (
      request.method === 'POST' &&
      (request.url.includes('/quizzes/generate') ||
        request.url.includes('/quizzes/create'))
    ) {
      // Check if user can create more quiz questions
      const canUseQuizQuestions = await this.usageTrackingService.canUseFeature(
        userId,
        'quizQuestion',
      );

      if (!canUseQuizQuestions) {
        throw new HttpException(
          'You have reached your quiz question generation limit for this billing period.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Proceed with the request and handle the response
      return next.handle().pipe(
        tap((response: GenerateQuizResponse) => {
          void (async () => {
            // The response should contain the created quiz and its questions
            if (response && response.id) {
              try {
                // Count the number of questions created for the quiz
                const questionsCount = await this.quizQuestionRepository.count({
                  where: { quizId: response.id },
                });

                if (questionsCount > 0) {
                  // Track the quiz questions usage
                  await this.usageTrackingService.trackQuizQuestions(
                    userId,
                    questionsCount,
                  );
                  console.log(
                    `Tracked ${questionsCount} quiz questions for user ${userId}`,
                  );
                }
              } catch (error: unknown) {
                const prefix = 'Failed to track quiz question usage';
                if (error instanceof Error) {
                  console.error(`${prefix}: ${error.message}`);
                } else if (typeof error === 'string') {
                  console.error(`${prefix}: ${error}`);
                } else if (
                  error &&
                  typeof (error as { message?: unknown }).message === 'string'
                ) {
                  console.error(
                    `${prefix}: ${(error as { message: string }).message}`,
                  );
                } else {
                  console.error(
                    `${prefix}: An unexpected error object was caught. Original error:`,
                    error,
                  );
                }
              }
            }
          })();
        }),
      );
    }

    return next.handle();
  }
}
